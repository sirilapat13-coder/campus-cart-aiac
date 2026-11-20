// orders.js - talks to Supabase about orders.
// Prices are NEVER sent from here. The database calculates them itself.

import { supabase } from './supabaseClient.js';

// Places an order for ONE store using the secure database function create_order.
// We send only product ids and quantities, never prices.
// For the Medicine store, tabletRequest is the student's request text:
// the database saves it for infirmary staff to approve.
// Returns the new order's id.
export async function placeOrder({
  shopId,
  items,
  deliveryLocation,
  roomNumber,
  deliveryInstructions,
  customerPhone,
  paymentMethod,
  tabletRequest
}) {
  const { data, error } = await supabase.rpc('create_order', {
    p_shop_id: shopId,
    p_delivery_location: deliveryLocation,
    p_items: items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
    p_room_number: roomNumber || null,
    p_delivery_instructions: deliveryInstructions || null,
    p_customer_phone: customerPhone,
    p_payment_method: paymentMethod,
    p_tablet_request: tabletRequest || null
  });
  if (error) throw error;
  return data;
}

// Places a Xerox order using the secure database function create_xerox_order.
// The PDF is already uploaded; we only send its path and the print options.
// The price is confirmed later by the Xerox shop.
export async function placeXeroxOrder({
  request,
  deliveryLocation,
  roomNumber,
  deliveryInstructions,
  customerPhone,
  paymentMethod
}) {
  const { data, error } = await supabase.rpc('create_xerox_order', {
    p_delivery_location: deliveryLocation,
    p_file_path: request.filePath,
    p_original_file_name: request.fileName,
    p_print_type: request.printType,
    p_print_sides: request.printSides,
    p_paper_size: request.paperSize,
    p_copies: request.copies,
    p_instructions: request.instructions || null,
    p_room_number: roomNumber || null,
    p_delivery_instructions: deliveryInstructions || null,
    p_customer_phone: customerPhone,
    p_payment_method: paymentMethod
  });
  if (error) throw error;
  return data;
}

// Gets the totals the DATABASE calculated for an order (the student's own order).
export async function getOrderSummary(orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, subtotal, delivery_fee, total_amount, payment_status, pricing_status, created_at')
    .eq('id', orderId)
    .single();
  if (error) throw error;
  return data;
}
// Gets the logged-in student's own orders, newest first, together with
// their items, status history, shop name and Xerox / tablet details.
export async function getMyOrders(userId) {
  const columns = [
    'id',
    'order_type',
    'status',
    'delivery_location',
    'room_number',
    'subtotal',
    'delivery_fee',
    'total_amount',
    'payment_status',
    'pricing_status',
    'cancellation_reason',
    'created_at',
    'shops ( name, slug )',
    'order_items ( id, item_name, quantity, unit_price, line_total )',
    'order_status_history ( status, note, created_at )',
    'xerox_requests ( original_file_name, print_type, print_sides, paper_size, copies, final_amount )',
    'infirmary_requests ( tablet_request, approval_status, staff_notes )'
  ].join(', ');

  const { data, error } = await supabase
    .from('orders')
    .select(columns)
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

// Cancels an order using the secure database function.
// (A student can only cancel their own order while it is still "placed".)
export async function cancelOrder(orderId, reason) {
  const { error } = await supabase.rpc('cancel_order', {
    p_order_id: orderId,
    p_reason: reason
  });
  if (error) throw error;
}

// Listens for changes to the student's orders in real time.
// "onChange" runs whenever one of their orders is added or updated.
// Returns a function that stops listening.
export function subscribeToMyOrders(userId, onChange) {
  const channel = supabase
    .channel(`my-orders-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}