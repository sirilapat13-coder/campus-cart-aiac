// stores.js - gets shop information from Supabase.

import { supabase } from './supabaseClient.js';

// The columns we need from the "shops" table.
const SHOP_COLUMNS =
  'id, name, slug, category, description, location, opening_hours, is_open, delivery_fee, image_url, sort_order';

// Gets every shop that is active, in the order you set in sort_order.
// (The database rules hide inactive shops from students automatically.)
export async function getAllShops() {
  const { data, error } = await supabase
    .from('shops')
    .select(SHOP_COLUMNS)
    .order('sort_order');
  if (error) throw error;
  return data;
}

// Gets ONE shop using its slug, for example 'canteen' or 'green-dabba-1'.
// Returns null if there is no such shop.
export async function getShopBySlug(slug) {
  const { data, error } = await supabase
    .from('shops')
    .select(SHOP_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}