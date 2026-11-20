// delivery.js - talks to Supabase for the delivery partner screen.
// The database rules decide which orders a delivery partner may see:
// unclaimed orders that are ready to deliver, and their own deliveries.

import { supabase } from './supabaseClient.js';

// Switches "available for deliveries" on or off for the logged-in partner.
// Returns the new value saved in the database.
export async function setDeliveryAvailable(userId, isAvailable) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ delivery_available: isAvailable })
    .eq('id', userId)
    .select('delivery_available')
    .single();
  if (error) throw error;
  return data.delivery_available;
}

// Gets the orders this partner is allowed to see (newest first).
export async function getDeliveryOrders() {
  const columns = [
    'id',
    'customer_id',
    'delivery_partner_id',
    'order_type',
    'status',
    'customer_name',
    'customer_phone',
    'delivery_location',
    'room_number',
    'delivery_instructions',
    'subtotal',
    'delivery_fee',
    'total_amount',
    'payment_status',
    'pricing_status',
    'created_at',
    'shops ( name, location )',
    'order_items ( id, item_name, quantity )'
  ].join(', ');

  const { data, error } = await supabase
    .from('orders')
    .select(columns)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

// Accepts an order. The database makes sure only ONE partner can get it.
export async function acceptOrder(orderId) {
  const { error } = await supabase.rpc('accept_order', { p_order_id: orderId });
  if (error) throw error;
}

// Moves an order forward: 'picked_up', 'out_for_delivery' or 'delivered'.
export async function updateDeliveryStatus(orderId, newStatus) {
  const { error } = await supabase.rpc('update_order_status', {
    p_order_id: orderId,
    p_new_status: newStatus
  });
  if (error) throw error;
}

// Listens for changes to orders in real time.
// Returns a function that stops listening.
export function subscribeToDeliveryOrders(onChange) {
  const channel = supabase
    .channel('delivery-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => onChange())
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}