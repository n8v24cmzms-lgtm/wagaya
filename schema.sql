-- 【旧バックエンド（Supabase）用・ロールバック時のみ使用】
-- 2026-11-09 に本番バックエンドは Firebase へ移行した（firebase/firestore.rules 等を参照）。
-- この schema.sql は Supabase に戻す場合のために保持している。
-- わが家の食材手帳 — Supabase スキーマ
-- 使い方: Supabase ダッシュボード → SQL Editor に全文を貼って Run（README 参照）
--
-- セキュリティ設計:
-- * 全テーブルで RLS を有効化し、「冷蔵庫のメンバーだけが、その冷蔵庫の
--   データを読み書きできる」ポリシーのみを許可する。匿名アクセスは一切なし。
-- * フレンドコードの平文は fridges に置かない。照合用ハッシュ
--   (invite_code_hash, pgcrypto の crypt/bcrypt) のみを保持し、照合は
--   security definer 関数 join_fridge_by_code の中だけで行う。
-- * 平文コードは fridge_invite_codes に分離し、RLS で「冷蔵庫の作成者
--   本人だけ select 可」。メンバーにも平文は読めない。
-- * create_fridge / regenerate_invite_code も security definer 関数経由で、
--   ハッシュ化はサーバー側で行う（クライアントにハッシュ生成をさせない）。
-- * join_fridge_by_code は試行回数を join_attempts に記録し、10分で10回を
--   超えたら拒否する（総当たり対策）。
-- * service_role key はフロントエンドに絶対置かない（anon key + RLS 前提）。

create extension if not exists pgcrypto;

-- ============ テーブル ============

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.fridges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  invite_code_hash text not null, -- crypt() による bcrypt ハッシュのみ。平文は置かない
  created_at timestamptz not null default now()
);

-- コード平文（作成者だけが読める別テーブル）
create table if not exists public.fridge_invite_codes (
  fridge_id uuid primary key references public.fridges (id) on delete cascade,
  code_plain text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fridge_members (
  fridge_id uuid not null references public.fridges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (fridge_id, user_id)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  fridge_id uuid not null references public.fridges (id) on delete cascade,
  name text not null,
  category text not null default 'その他',
  quantity numeric not null default 1 check (quantity >= 0),
  unit text not null default '',
  expiry_date date,
  storage_location text not null default '冷蔵庫',
  is_favorite boolean not null default false,
  low_threshold numeric not null default 1 check (low_threshold >= 0),
  photo_path text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  fridge_id uuid not null references public.fridges (id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default '',
  source text not null default 'manual' check (source in ('manual', 'favorite', 'recipe')),
  linked_item_id uuid references public.items (id) on delete set null,
  is_checked boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.fridge_settings (
  fridge_id uuid primary key references public.fridges (id) on delete cascade,
  family_size int not null default 2 check (family_size between 1 and 10),
  updated_at timestamptz not null default now()
);

-- レシピお気に入り: レシピは在庫から都度生成されるため、再表示できるよう
-- 内容（名前・材料・分量・手順）を snapshot (jsonb) として丸ごと保存する。
-- スコープは「ユーザー × 冷蔵庫」で、他人のお気に入りは読めない。
create table if not exists public.favorite_recipes (
  id uuid primary key default gen_random_uuid(),
  fridge_id uuid not null references public.fridges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_key text not null, -- 例 "oyakodon:stock"（レシピID × モード）同一ユーザー×冷蔵庫で一意
  recipe_id text not null,
  mode text not null default 'stock' check (mode in ('stock', 'shop')),
  title text not null,
  snapshot jsonb not null, -- { title, minutes, tip, steps[], have[], missing[], servings }
  created_at timestamptz not null default now(),
  unique (fridge_id, user_id, recipe_key)
);

-- コード参加の試行記録（ポリシーなし = クライアントからは読み書き不可。
-- security definer 関数だけが触る）
create table if not exists public.join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index if not exists join_attempts_user_time on public.join_attempts (user_id, attempted_at);
create index if not exists items_fridge on public.items (fridge_id);
create index if not exists shopping_fridge on public.shopping_items (fridge_id);
create index if not exists favorite_recipes_fridge_user on public.favorite_recipes (fridge_id, user_id);

-- 食材図鑑コレクション（冷蔵庫単位）: 在庫に食材を登録すると自動で記録される。
-- 在庫から消しても図鑑には残る。同じ冷蔵庫×同じ名前は1件だけ。
create table if not exists public.fridge_catalog (
  id uuid primary key default gen_random_uuid(),
  fridge_id uuid not null references public.fridges (id) on delete cascade,
  name text not null,
  category text not null default 'その他',
  first_added_at timestamptz not null default now(),
  added_by uuid references public.profiles (id) on delete set null,
  -- 購入回数（食材レベル・称号の元データ）。在庫登録と買い物「買った！」で +1
  purchase_count integer not null default 1,
  unique (fridge_id, name)
);
-- 既存プロジェクト向けマイグレーション（列が無ければ追加するだけ。再実行OK）
alter table public.fridge_catalog add column if not exists purchase_count integer not null default 1;
create index if not exists fridge_catalog_fridge on public.fridge_catalog (fridge_id);

-- ============ ヘルパー関数 ============

-- メンバー判定（RLS ポリシー内での再帰を避けるため security definer）
create or replace function public.is_fridge_member(p_fridge_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.fridge_members where fridge_id = p_fridge_id and user_id = p_user_id);
$$;

-- 新規ユーザー登録時に profiles を自動作成（display_name は登録時メタデータ）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ============ 冷蔵庫まわりの RPC（security definer） ============

-- 冷蔵庫の作成: ハッシュ化・作成者メンバー登録・設定初期化・平文コード保存を一括で
create or replace function public.create_fridge(p_name text, p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_fridge_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.fridges (name, owner_id, invite_code_hash)
  values (coalesce(nullif(trim(p_name), ''), 'わが家の冷蔵庫'), auth.uid(), crypt(p_code, gen_salt('bf')))
  returning id into v_fridge_id;
  insert into public.fridge_invite_codes (fridge_id, code_plain) values (v_fridge_id, p_code);
  insert into public.fridge_members (fridge_id, user_id, role) values (v_fridge_id, auth.uid(), 'owner');
  insert into public.fridge_settings (fridge_id) values (v_fridge_id);
  return v_fridge_id;
end;
$$;

-- コードで参加: 試行回数制限つき。照合はこの関数の中だけ。
create or replace function public.join_fridge_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_fridge_id uuid;
  v_attempts int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.join_attempts (user_id) values (auth.uid());
  delete from public.join_attempts where attempted_at < now() - interval '1 day';
  select count(*) into v_attempts from public.join_attempts
    where user_id = auth.uid() and attempted_at > now() - interval '10 minutes';
  if v_attempts > 10 then raise exception 'too_many_attempts'; end if;
  select id into v_fridge_id from public.fridges
    where invite_code_hash = crypt(p_code, invite_code_hash);
  if v_fridge_id is null then raise exception 'code_not_found'; end if;
  insert into public.fridge_members (fridge_id, user_id, role)
  values (v_fridge_id, auth.uid(), 'member')
  on conflict (fridge_id, user_id) do nothing;
  return v_fridge_id;
end;
$$;

-- コード再発行: 作成者のみ。旧ハッシュは上書きされ即無効になる
create or replace function public.regenerate_invite_code(p_fridge_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.fridges where id = p_fridge_id and owner_id = auth.uid()) then
    raise exception 'not_owner';
  end if;
  update public.fridges set invite_code_hash = crypt(p_code, gen_salt('bf')) where id = p_fridge_id;
  insert into public.fridge_invite_codes (fridge_id, code_plain, updated_at)
  values (p_fridge_id, p_code, now())
  on conflict (fridge_id) do update set code_plain = excluded.code_plain, updated_at = now();
end;
$$;

-- 退会: 自分のアカウントと自分のデータを削除する
-- 共有している冷蔵庫の在庫・買い物リスト・図鑑は家族のものとして残す
-- （items / shopping_items の created_by だけ null にする）。
-- 自分が作った冷蔵庫は、他のメンバーがいれば一番古くからいるメンバーへ
-- 作成者を引き継ぎ、メンバーが自分だけなら冷蔵庫ごと削除する
-- （fridges の on delete cascade で在庫・設定・図鑑・招待コードも消える）。
-- auth.users の削除は anon key ではできないため、この security definer
-- 関数の中で行う（profiles は on delete cascade で連動して消える）。
-- 注意: Storage（item-photos）の写真ファイルは DB 削除と連動しない。
-- 削除した冷蔵庫の写真は運営者がバケット側で整理すること。
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_fridge_id uuid;
  v_new_owner uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  for v_fridge_id in select id from public.fridges where owner_id = auth.uid() loop
    select user_id into v_new_owner from public.fridge_members
      where fridge_id = v_fridge_id and user_id <> auth.uid()
      order by joined_at asc limit 1;
    if v_new_owner is null then
      delete from public.fridges where id = v_fridge_id;
    else
      update public.fridges set owner_id = v_new_owner where id = v_fridge_id;
      update public.fridge_members set role = 'owner'
        where fridge_id = v_fridge_id and user_id = v_new_owner;
    end if;
  end loop;
  update public.items set created_by = null where created_by = auth.uid();
  update public.shopping_items set created_by = null where created_by = auth.uid();
  delete from public.favorite_recipes where user_id = auth.uid();
  delete from public.fridge_members where user_id = auth.uid();
  delete from public.join_attempts where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

-- ============ RLS ============

alter table public.profiles enable row level security;
alter table public.fridges enable row level security;
alter table public.fridge_invite_codes enable row level security;
alter table public.fridge_members enable row level security;
alter table public.items enable row level security;
alter table public.shopping_items enable row level security;
alter table public.fridge_settings enable row level security;
alter table public.favorite_recipes enable row level security;
alter table public.fridge_catalog enable row level security;
alter table public.join_attempts enable row level security;
-- join_attempts: ポリシーを作らない = クライアントからは一切アクセス不可

-- profiles: 自分自身 + 同じ冷蔵庫のメンバー同士だけ表示名を共有
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.fridge_members mine
    join public.fridge_members theirs on theirs.fridge_id = mine.fridge_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- fridges: メンバーのみ閲覧。名称変更は作成者のみ。
-- （作成は create_fridge RPC 経由のみ。insert ポリシーは作らない）
create policy fridges_select on public.fridges for select to authenticated
  using (public.is_fridge_member(id, auth.uid()));
create policy fridges_update on public.fridges for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- コード平文: 冷蔵庫の作成者本人だけが読める
create policy invite_codes_select_owner on public.fridge_invite_codes for select to authenticated
  using (exists (select 1 from public.fridges f where f.id = fridge_id and f.owner_id = auth.uid()));

-- メンバー一覧: 自分が所属する冷蔵庫のみ。削除は「本人の退出」または「作成者による除名」
create policy members_select on public.fridge_members for select to authenticated
  using (public.is_fridge_member(fridge_id, auth.uid()));
create policy members_delete on public.fridge_members for delete to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.fridges f where f.id = fridge_id and f.owner_id = auth.uid()));

-- 在庫・買い物・設定: メンバーだけが読み書き可
create policy items_all on public.items for all to authenticated
  using (public.is_fridge_member(fridge_id, auth.uid()))
  with check (public.is_fridge_member(fridge_id, auth.uid()));
create policy shopping_all on public.shopping_items for all to authenticated
  using (public.is_fridge_member(fridge_id, auth.uid()))
  with check (public.is_fridge_member(fridge_id, auth.uid()));
create policy settings_all on public.fridge_settings for all to authenticated
  using (public.is_fridge_member(fridge_id, auth.uid()))
  with check (public.is_fridge_member(fridge_id, auth.uid()));

-- レシピお気に入り: 本人のものだけ読み書き可（所属する冷蔵庫の範囲内）
create policy favorite_recipes_all on public.favorite_recipes for all to authenticated
  using (user_id = auth.uid() and public.is_fridge_member(fridge_id, auth.uid()))
  with check (user_id = auth.uid() and public.is_fridge_member(fridge_id, auth.uid()));

-- 食材図鑑コレクション: メンバーだけが閲覧・登録可（冷蔵庫単位で共有）
create policy fridge_catalog_select on public.fridge_catalog for select to authenticated
  using (public.is_fridge_member(fridge_id, auth.uid()));
create policy fridge_catalog_insert on public.fridge_catalog for insert to authenticated
  with check (public.is_fridge_member(fridge_id, auth.uid()));
-- 購入回数の更新（レベル用）もメンバーだけ
create policy fridge_catalog_update on public.fridge_catalog for update to authenticated
  using (public.is_fridge_member(fridge_id, auth.uid()))
  with check (public.is_fridge_member(fridge_id, auth.uid()));

-- RPC の実行権限
revoke execute on function public.create_fridge(text, text) from public;
revoke execute on function public.join_fridge_by_code(text) from public;
revoke execute on function public.regenerate_invite_code(uuid, text) from public;
revoke execute on function public.delete_my_account() from public;
grant execute on function public.create_fridge(text, text) to authenticated;
grant execute on function public.join_fridge_by_code(text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- ============ Storage（食材写真・非公開バケット） ============
-- パス規約: {fridge_id}/{ファイル名}。先頭フォルダでメンバー判定する。
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

create policy item_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'item-photos'
    and public.is_fridge_member(((storage.foldername(name))[1])::uuid, auth.uid()));
create policy item_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'item-photos'
    and public.is_fridge_member(((storage.foldername(name))[1])::uuid, auth.uid()));
create policy item_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'item-photos'
    and public.is_fridge_member(((storage.foldername(name))[1])::uuid, auth.uid()));
create policy item_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'item-photos'
    and public.is_fridge_member(((storage.foldername(name))[1])::uuid, auth.uid()));

-- ============ プッシュ通知の購読（サーバー発 Web Push 用） ============
-- 購読情報は「本人の行だけ」読み書きできる（他人の購読先は見えない）。
-- 送信は service role を使う Edge Function 側でのみ行う（README 参照）。
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- ============ リアルタイム更新（Supabase Realtime） ============
-- 家族の編集を再読み込みなしで反映するため、対象テーブルを
-- supabase_realtime publication に追加する（既に追加済みなら何もしない）。
-- ※ WAL レベル等の前提は既定の Supabase プロジェクトで満たされる。
-- ※ テーブル側の RLS は Realtime にも適用されるため、メンバーでない人の
--    変更イベントが届くことはない。
do $$
begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.shopping_items;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.fridge_catalog;
exception when duplicate_object then null;
end $$;
