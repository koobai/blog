(function() {
  'use strict';

  const modules = window.JingzheZouguoModules = window.JingzheZouguoModules || {};

  const areaLabelForPlace = place => {
    const region = String(place?.region || '').trim();
    const locality = String(place?.locality || '').trim();
    const country = String(place?.country || '').trim();
    const parts = [];
    if (region) parts.push(region);
    if (locality && locality !== region) parts.push(locality);
    if (!parts.length && country) parts.push(country);
    return parts.join(' · ');
  };

  const sourceLabelForItem = item => {
    const sourceType = String(item?.source?.type || '').trim();
    if (sourceType === 'laodao') return '来自唠叨';
    if (sourceType === 'post') return '来自随笔';
    return '';
  };

  const normalizeImage = image => {
    if (typeof image === 'string') {
      return { original: image, thumb: image, small: image, large: image, alt: '' };
    }
    const original = String(image?.original || image?.url || '').trim();
    if (!original) return null;
    return {
      original,
      thumb: String(image?.thumb || original),
      small: String(image?.small || original),
      large: String(image?.large || original),
      alt: String(image?.alt || '')
    };
  };

  const imageSource = (image, variant = 'original') => String(
    image?.[variant] || image?.original || ''
  );

  const originalImageSources = images => images.map(image => imageSource(image)).filter(Boolean);

  modules.createModel = (payload, currentYear = String(new Date().getFullYear())) => {
    const normalizeFeedItem = item => {
      const place = item?.place && typeof item.place === 'object' ? item.place : {};
      const occurredAt = String(item?.occurredAt || item?.date || '');
      const date = occurredAt.slice(0, 10);
      const dateParts = date.split('-');
      const images = Array.isArray(item?.images)
        ? item.images.map(normalizeImage).filter(Boolean)
        : [];
      const countryCode = String(place.countryCode || item?.countryCode || '');

      return Object.assign({}, item, {
        year: dateParts[0] || '',
        date,
        dateLabel: dateParts.length === 3
          ? (dateParts[0] === currentYear ? `${dateParts[1]}-${dateParts[2]}` : date)
          : date,
        place: place.name || item?.place || '',
        locationId: place.id || item?.locationId || item?.id,
        locationName: place.name || item?.locationName || item?.place || '',
        region: String(place.region || item?.region || '').trim(),
        locality: String(place.locality || item?.locality || '').trim(),
        areaLabel: areaLabelForPlace(place) || String(item?.region || '').trim(),
        countryCode,
        provinceCode: place.regionCode || item?.provinceCode || '',
        cityCode: place.localityCode || item?.cityCode || '',
        coordinates: [Number(place.longitude), Number(place.latitude)],
        text: typeof item?.summary === 'string' ? item.summary : String(item?.text || ''),
        images
      });
    };

    const items = Array.isArray(payload.items) ? payload.items.map(normalizeFeedItem) : [];
    const itemsById = new Map(items.map(item => [item.id, item]));
    const itemLocationIds = new Map();
    const locationMap = new Map();
    items.forEach(item => {
      const locationId = item.locationId || item.id;
      itemLocationIds.set(item.id, locationId);
      if (!locationMap.has(locationId)) {
        locationMap.set(locationId, {
          id: locationId,
          name: item.locationName || item.place,
          coordinates: item.coordinates,
          items: []
        });
      }
      locationMap.get(locationId).items.push(item);
    });
    const locations = Array.from(locationMap.values()).map(location => {
      location.items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return location;
    });

    return {
      items,
      itemsById,
      itemLocationIds,
      locations,
      locationsById: new Map(locations.map(location => [location.id, location])),
      imageSource,
      originalImageSources,
      sourceLabelForItem
    };
  };
})();
