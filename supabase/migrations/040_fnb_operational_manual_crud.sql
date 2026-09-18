-- TRACE v72.10 — real manual F&B operational CRUD (inventory, recipe, movement).
create or replace function public.trace_create_inventory_item(p_client_id text,p_outlet_id text,p_sku text,p_item_name text,p_unit text,p_unit_cost numeric)
returns uuid language plpgsql security definer set search_path=public as $$ declare v uuid; begin
 if not public.trace_is_team_member() then raise exception 'TRACE_INVENTORY_ACTOR_FORBIDDEN'; end if;
 insert into public.trace_inventory_items(organization_id,outlet_id,sku,item_name,unit,unit_cost,created_by) values(trim(p_client_id),nullif(trim(p_outlet_id),''),nullif(trim(p_sku),''),trim(p_item_name),trim(p_unit),p_unit_cost,auth.uid()) returning id into v;
 perform public.trace_append_audit_event('insert','inventory_item',v::text,null,jsonb_build_object('client_id',p_client_id,'item_name',p_item_name,'unit_cost',p_unit_cost),null); return v; end $$;
grant execute on function public.trace_create_inventory_item(text,text,text,text,text,numeric) to authenticated;
create or replace function public.trace_update_inventory_item(p_id uuid,p_client_id text,p_outlet_id text,p_sku text,p_item_name text,p_unit text,p_unit_cost numeric,p_active boolean)
returns boolean language plpgsql security definer set search_path=public as $$ begin
 if not public.trace_is_team_member() then raise exception 'TRACE_INVENTORY_ACTOR_FORBIDDEN'; end if;
 update public.trace_inventory_items set outlet_id=nullif(trim(p_outlet_id),''),sku=nullif(trim(p_sku),''),item_name=trim(p_item_name),unit=trim(p_unit),unit_cost=p_unit_cost,active=coalesce(p_active,true) where id=p_id and organization_id=trim(p_client_id);
 if not found then raise exception 'TRACE_INVENTORY_ITEM_NOT_FOUND'; end if; return true; end $$;
grant execute on function public.trace_update_inventory_item(uuid,text,text,text,text,text,numeric,boolean) to authenticated;
create or replace function public.trace_create_inventory_recipe(p_client_id text,p_product_id uuid,p_item_id uuid,p_qty_per_sale numeric)
returns uuid language plpgsql security definer set search_path=public as $$ declare v uuid; begin
 if not public.trace_is_team_member() then raise exception 'TRACE_RECIPE_ACTOR_FORBIDDEN'; end if;
 if not exists(select 1 from public.trace_product_catalog where id=p_product_id and client_id=trim(p_client_id)) then raise exception 'TRACE_RECIPE_PRODUCT_SCOPE'; end if;
 if not exists(select 1 from public.trace_inventory_items where id=p_item_id and organization_id=trim(p_client_id)) then raise exception 'TRACE_RECIPE_ITEM_SCOPE'; end if;
 insert into public.trace_inventory_recipes(organization_id,product_id,item_id,qty_per_sale,created_by) values(trim(p_client_id),p_product_id,p_item_id,p_qty_per_sale,auth.uid()) returning id into v;
 perform public.trace_append_audit_event('insert','inventory_recipe',v::text,null,jsonb_build_object('client_id',p_client_id,'product_id',p_product_id,'item_id',p_item_id,'qty_per_sale',p_qty_per_sale),null); return v; end $$;
grant execute on function public.trace_create_inventory_recipe(text,uuid,uuid,numeric) to authenticated;
create or replace function public.trace_delete_inventory_recipe(p_id uuid,p_client_id text) returns boolean language plpgsql security definer set search_path=public as $$ begin
 if not public.trace_is_team_member() then raise exception 'TRACE_RECIPE_ACTOR_FORBIDDEN'; end if;
 delete from public.trace_inventory_recipes where id=p_id and organization_id=trim(p_client_id); return found; end $$;
grant execute on function public.trace_delete_inventory_recipe(uuid,text) to authenticated;
create or replace function public.trace_create_inventory_movement(p_client_id text,p_outlet_id text,p_item_id uuid,p_movement_type text,p_qty numeric,p_unit_cost numeric,p_occurred_at timestamptz,p_source_record_id text)
returns uuid language plpgsql security definer set search_path=public as $$ declare v uuid; begin
 if not public.trace_is_team_member() then raise exception 'TRACE_INVENTORY_ACTOR_FORBIDDEN'; end if;
 if not exists(select 1 from public.trace_inventory_items where id=p_item_id and organization_id=trim(p_client_id)) then raise exception 'TRACE_INVENTORY_ITEM_SCOPE'; end if;
 insert into public.trace_inventory_movements(organization_id,outlet_id,item_id,movement_type,qty,unit_cost,occurred_at,source_record_id,created_by) values(trim(p_client_id),nullif(trim(p_outlet_id),''),p_item_id,p_movement_type,p_qty,p_unit_cost,p_occurred_at,nullif(trim(p_source_record_id),''),auth.uid()) returning id into v;
 perform public.trace_append_audit_event('insert','inventory_movement',v::text,null,jsonb_build_object('client_id',p_client_id,'item_id',p_item_id,'type',p_movement_type,'qty',p_qty),null); return v; end $$;
grant execute on function public.trace_create_inventory_movement(text,text,uuid,text,numeric,numeric,timestamptz,text) to authenticated;
