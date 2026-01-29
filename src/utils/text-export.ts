import { formatPrice } from './order-utils';

export const formatOrdersToText = (orders: any[]) => {
  return orders.map(order => {
    const itemsString = order.items.map((item: any) => 
      `- ${item.quantity}x ${item.product?.name || 'Unknown'} (${item.variant?.name || 'Unknown'})`
    ).join('\n');

    return `Commande #${order.id}
Client: ${order.customerName}
Tél: ${order.phone || 'N/A'}
Ville: ${order.city || 'N/A'}
Adresse: ${order.address || 'N/A'}
Service: ${order.deliveryService?.name || 'N/A'}
Prix: ${formatPrice(order.totalAmount)} MAD
Produits:
${itemsString}
Note: ${order.note || ''}
----------------------------------------`;
  }).join('\n\n');
};