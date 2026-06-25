type AddressInput = {
  label?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  postalCode?: string | null;
  country?: string | null;
  freeform?: string | null;
};

export function buildAddressText(input: AddressInput | null | undefined) {
  if (!input) return null;
  const explicit = String(input.freeform || '').trim();
  if (explicit) return explicit;
  const parts = [
    input.line1,
    input.line2,
    input.city,
    input.state,
    input.postcode || input.postalCode,
    input.country,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function buildMapLinks(address: string | null | undefined) {
  const query = String(address || '').trim();
  if (!query) {
    return {
      ready: false,
      reason: 'address_missing',
      address: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
      genericMapsUrl: null,
      geocodeReady: Boolean(String(process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || '').trim()),
      liveTrackingEnabled: false,
    };
  }
  const encoded = encodeURIComponent(query);
  return {
    ready: true,
    reason: 'address_link_ready',
    address: query,
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    appleMapsUrl: `https://maps.apple.com/?q=${encoded}`,
    genericMapsUrl: `https://www.openstreetmap.org/search?query=${encoded}`,
    geocodeReady: Boolean(String(process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || '').trim()),
    liveTrackingEnabled: false,
  };
}
