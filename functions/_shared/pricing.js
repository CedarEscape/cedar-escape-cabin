// Single source of truth for massage pricing/duration. Change a price here only.
export const SERVICES = {
  therapeutic_60:       { label: '60-Minute Therapeutic Massage',                          priceCents: 16000, minutes: 60 },
  therapeutic_90:       { label: '90-Minute Therapeutic Massage',                          priceCents: 22000, minutes: 90 },
  couples_back_to_back: { label: '60-Minute Back-to-Back Couples Massage',                 priceCents: 30500, minutes: 120 },
  couples_simultaneous: { label: '60-Minute Simultaneous Couples Massage (2 Therapists)',  priceCents: 39000, minutes: 60 },
  deep_tissue_90:       { label: '90-Minute Deep Tissue Massage',                          priceCents: 24000, minutes: 90 },
  hot_stone:            { label: 'Hot Stone Massage',                                      priceCents: 19000, minutes: 60 },
};

export const CBD_ADDON_CENTS = 3000;
export const CBD_ADDON_LABEL = 'CBD Oil Add-On';

export function priceItem(item) {
  const service = SERVICES[item.serviceCode];
  if (!service) throw new Error('Unknown service code: ' + item.serviceCode);
  const cbdEligible = item.serviceCode !== 'couples_back_to_back' && item.serviceCode !== 'couples_simultaneous';
  const cbdAddon = cbdEligible && !!item.cbdAddon;
  return {
    guestLabel: item.guestLabel,
    serviceCode: item.serviceCode,
    serviceLabel: service.label,
    servicePriceCents: service.priceCents,
    minutes: service.minutes,
    cbdAddon,
    cbdPriceCents: cbdAddon ? CBD_ADDON_CENTS : 0,
    lineTotalCents: service.priceCents + (cbdAddon ? CBD_ADDON_CENTS : 0),
  };
}

export function priceRequest(items) {
  const priced = items.map(priceItem);
  const subtotalCents = priced.reduce((sum, i) => sum + i.lineTotalCents, 0);
  const depositCents = Math.round(subtotalCents * 0.5);
  const balanceCents = subtotalCents - depositCents;
  return { priced, subtotalCents, depositCents, balanceCents };
}

// Total appointment duration per section 18 of the spec:
// sequential services sum; simultaneous couples massage is NOT doubled.
export function calculateMinutes(items) {
  return items.reduce((total, item) => {
    // Accepts either camelCase (API input) or snake_case (D1 row) shapes.
    const service = SERVICES[item.serviceCode || item.service_code];
    if (!service) return total;
    return total + service.minutes;
  }, 0);
}
