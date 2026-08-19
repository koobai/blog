(function() {
  'use strict';

  const root = document.getElementById('zouguo-app');
  const dataNode = document.getElementById('zouguo-feed-data');
  const boundaryDataUrl = root?.dataset.boundaryUrl || '';
  if (!root || !dataNode) return;

  let payload;
  try {
    payload = JSON.parse(dataNode.textContent || '{}');
  } catch (_error) {
    root.classList.add('is-map-error');
    return;
  }

  const boundaryCountryCodes = {
    CN: '100000',
    AE: 'ARE',
    KW: 'KWT'
  };
  const normalizeFeedItem = item => {
    const place = item?.place && typeof item.place === 'object' ? item.place : {};
    const occurredAt = String(item?.occurredAt || item?.date || '');
    const date = occurredAt.slice(0, 10);
    const dateParts = date.split('-');
    const images = Array.isArray(item?.images)
      ? item.images.map(image => typeof image === 'string' ? image : image?.url).filter(Boolean)
      : [];
    const countryCode = String(place.countryCode || item?.countryCode || '');

    return Object.assign({}, item, {
      year: dateParts[0] || '',
      date,
      dateLabel: dateParts.length === 3 ? `${dateParts[1]}月${dateParts[2]}日` : date,
      place: place.name || item?.place || '',
      locationId: place.id || item?.locationId || item?.id,
      locationName: place.name || item?.locationName || item?.place || '',
      region: place.region || place.country || item?.region || '',
      countryCode: boundaryCountryCodes[countryCode] || countryCode,
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
  const locationsById = new Map(locations.map(location => [location.id, location]));
  const cards = Array.from(root.querySelectorAll('[data-zouguo-id]'));
  const entryGalleries = Array.from(root.querySelectorAll('[data-entry-gallery]'));
  const timelineDates = Array.from(root.querySelectorAll('[data-zouguo-date]'));
  const filterButtons = Array.from(root.querySelectorAll('[data-year]'))
    .filter(button => button.classList.contains('zouguo-year-filter'));
  const caption = document.getElementById('zouguo-map-caption');
  const scopeBackButton = document.getElementById('zouguo-scope-back');
  const overviewButton = document.getElementById('zouguo-overview');
  const randomButton = document.getElementById('zouguo-random');
  const timelinePanel = root.querySelector('.zouguo-timeline');
  const timelineRevealButton = document.getElementById('zouguo-timeline-reveal');

  let map = null;
  let selectedId = null;
  let randomItemId = null;
  let activeYear = 'all';
  let markers = new Map();
  let currentMapStyle = '';
  let boundaryCollections = null;
  let coordinatePopup = null;
  let coordinatePopupId = null;
  let focusRun = 0;
  let focusingLocationId = null;
  let clusterMarkers = [];
  let orbitRun = 0;
  let isOrbiting = false;
  let activeOrbitLocationId = null;
  let timelineFocusId = null;
  let returnMapView = null;
  let mapViewHistory = [];
  let basemapLabelsConfigured = false;
  let basemapPlaceLabelsVisible = null;
  let basemapRoadLabelsVisible = null;

  const boundarySourceIds = {
    country: 'zouguo-visited-country',
    province: 'zouguo-visited-province',
    city: 'zouguo-visited-city'
  };

  const classicContextLabelLayerIds = [
    'continent-label',
    'country-label',
    'state-label',
    'settlement-major-label',
    'settlement-minor-label'
  ];

  const classicUtilityLabelLayerIds = [
    'settlement-subdivision-label',
    'airport-label',
    'poi-label'
  ];

  const classicRoadLabelLayerIds = ['road-label-simple'];
  const isDarkTheme = () => {
    const explicitTheme = document.documentElement.getAttribute('data-theme');
    if (explicitTheme === 'dark') return true;
    if (explicitTheme === 'light') return false;
    return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };

  const mapStyle = () => isDarkTheme()
    ? root.dataset.mapStyleDark
    : root.dataset.mapStyleLight;

  const shouldShowRoadLabels = () => Boolean(
    map && (coordinatePopup || focusingLocationId)
  );

  const setClassicLayerVisibility = (layerIds, visible) => {
    if (!map) return;
    layerIds.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    });
  };

  const styleClassicRoadLabels = () => {
    if (!map) return;
    classicRoadLabelLayerIds.forEach(layerId => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, 'text-padding', 14);
      map.setLayoutProperty(layerId, 'symbol-spacing', 460);
      map.setPaintProperty(layerId, 'text-color', '#66706d');
      map.setPaintProperty(layerId, 'text-halo-color', 'rgba(14, 17, 17, 0.94)');
      map.setPaintProperty(layerId, 'text-halo-width', 0.9);
      map.setPaintProperty(layerId, 'text-opacity', 0.56);
    });
  };

  const syncBasemapLabels = () => {
    if (!map) return;
    const showPlaces = map.getZoom() < 10.8;
    const showRoads = shouldShowRoadLabels();
    const hasStandardBasemap = (map.getStyle()?.imports || []).some(item => item.id === 'basemap');

    if (hasStandardBasemap && typeof map.setConfigProperty === 'function') {
      basemapLabelsConfigured = true;
      if (basemapPlaceLabelsVisible !== showPlaces) {
        map.setConfigProperty('basemap', 'showPlaceLabels', showPlaces);
        basemapPlaceLabelsVisible = showPlaces;
      }
      if (basemapRoadLabelsVisible !== showRoads) {
        map.setConfigProperty('basemap', 'showRoadLabels', showRoads);
        basemapRoadLabelsVisible = showRoads;
      }
      return;
    }

    if (!basemapLabelsConfigured) {
      setClassicLayerVisibility(classicUtilityLabelLayerIds, false);
      basemapLabelsConfigured = true;
    }
    if (basemapPlaceLabelsVisible !== showPlaces) {
      setClassicLayerVisibility(classicContextLabelLayerIds, showPlaces);
      basemapPlaceLabelsVisible = showPlaces;
    }
    if (basemapRoadLabelsVisible !== showRoads) {
      setClassicLayerVisibility(classicRoadLabelLayerIds, showRoads);
      basemapRoadLabelsVisible = showRoads;
      if (showRoads) styleClassicRoadLabels();
    }
  };

  const applyBasemapPresentation = () => {
    if (!map) return;
    try {
      syncBasemapLabels();
    } catch (_error) {
      // Keep the published Studio defaults if a basemap does not expose runtime visibility controls.
    }
  };

  const visibleItems = () => items.filter(item => activeYear === 'all' || item.year === activeYear);

  const hasOverlayTimeline = () => window.innerWidth > 860;

  const setTimelineRetracted = active => {
    const retracted = Boolean(active && hasOverlayTimeline());
    const controlVisible = Boolean(
      hasOverlayTimeline()
      && (retracted || root.classList.contains('is-coordinate-card-open'))
    );
    root.classList.toggle('is-timeline-retracted', retracted);
    if (timelinePanel) {
      timelinePanel.toggleAttribute('inert', retracted);
      if (retracted) timelinePanel.setAttribute('aria-hidden', 'true');
      else timelinePanel.removeAttribute('aria-hidden');
    }
    if (timelineRevealButton) {
      timelineRevealButton.tabIndex = controlVisible ? 0 : -1;
      timelineRevealButton.setAttribute('aria-hidden', controlVisible ? 'false' : 'true');
      timelineRevealButton.setAttribute('aria-label', retracted ? '展开走过列表' : '收起走过列表');
      timelineRevealButton.title = retracted ? '展开走过列表' : '收起走过列表';
    }
  };

  const timelineOverlayWidth = () => hasOverlayTimeline()
    ? Math.round(timelinePanel?.getBoundingClientRect().width || 0)
    : 0;

  const mapViewportPadding = edge => {
    const safeEdge = Number(edge) || 0;
    if (!hasOverlayTimeline()) return safeEdge;
    return {
      top: safeEdge,
      right: safeEdge + timelineOverlayWidth() + 32,
      bottom: safeEdge,
      left: safeEdge
    };
  };

  const updateTimelineDates = () => {
    const currentYear = String(new Date().getFullYear());
    timelineDates.forEach(date => {
      const showYear = activeYear === 'all' && date.dataset.zouguoYear !== currentYear;
      date.textContent = `${showYear ? `${date.dataset.zouguoYear} · ` : ''}${date.dataset.dateLabel}`;
    });
  };

  const emptyFeatureCollection = () => ({ type: 'FeatureCollection', features: [] });

  const asFeatureCollection = data => {
    if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) return data;
    if (data?.type === 'Feature') return { type: 'FeatureCollection', features: [data] };
    return emptyFeatureCollection();
  };

  const areaNameForMap = () => {
    const yearPrefix = activeYear === 'all' ? '' : `${activeYear} · `;
    if (!map || map.getZoom() < 4.05) return activeYear === 'all' ? '全部走过' : `${activeYear} 年走过`;

    const bounds = map.getBounds();
    const center = map.getCenter();
    const entries = visibleItems().filter(item => bounds.contains(item.coordinates));
    if (!entries.length) return `${yearPrefix}地图漫游`;

    const distanceFromCenter = item => {
      const longitude = Number(item.coordinates?.[0]) || 0;
      const latitude = Number(item.coordinates?.[1]) || 0;
      return Math.hypot(longitude - center.lng, latitude - center.lat);
    };
    const nearestFirst = entries.slice().sort((a, b) => distanceFromCenter(a) - distanceFromCenter(b));

    if (map.getZoom() < 6.55) {
      const regions = Array.from(new Set(nearestFirst.map(item => item.region).filter(Boolean)));
      if (regions.length === 1) return `${yearPrefix}${regions[0]}走过`;
      if (regions.length === 2) return `${yearPrefix}${regions.join(' · ')}`;
      return `${yearPrefix}多省走过`;
    }

    const cities = Array.from(new Set(nearestFirst.map(item => String(item.place || '').split('·')[0].trim()).filter(Boolean)));
    if (cities.length === 1) return `${yearPrefix}${cities[0]}走过`;
    return `${yearPrefix}${cities[0]}周边`;
  };

  const mapScopeIndex = () => {
    if (!map) return 0;
    if (coordinatePopup || focusingLocationId) return 3;
    const zoom = map.getZoom();
    if (zoom < 4.05) return 0;
    if (zoom < 6.55) return 1;
    if (zoom < 10.8) return 2;
    return 3;
  };

  const updateScope = () => {
    if (caption) caption.textContent = areaNameForMap();
    if (scopeBackButton) {
      const canReturn = mapViewHistory.length > 0 || mapScopeIndex() > 0;
      scopeBackButton.disabled = !canReturn;
      scopeBackButton.classList.toggle('is-back', canReturn);
      scopeBackButton.setAttribute('aria-label', canReturn ? '返回上一层地图' : '当前为全部走过');
    }
  };

  const updateCaption = () => updateScope();

  const updateScopeAfterMove = () => {
    if (!coordinatePopup && !focusingLocationId && mapScopeIndex() === 0) {
      mapViewHistory = [];
    }
    updateScope();
  };

  const visibleEntriesForLocation = location => location.items.filter(
    item => activeYear === 'all' || item.year === activeYear
  );

  const closeCoordinateCard = options => {
    const settings = Object.assign({
      cancelFocus: true,
      stopMap: true,
      keepTimelineRetracted: false
    }, options || {});
    orbitRun += 1;
    isOrbiting = false;
    activeOrbitLocationId = null;
    root.classList.remove('is-map-orbiting');
    if (settings.cancelFocus) focusRun += 1;
    if (settings.stopMap && settings.cancelFocus && map?.isMoving()) map.stop();
    if (focusingLocationId) markers.get(focusingLocationId)?.element.classList.remove('is-focusing');
    focusingLocationId = null;
    root.classList.remove('is-location-focusing', 'is-coordinate-card-open');
    if (!settings.keepTimelineRetracted) setTimelineRetracted(false);
    if (coordinatePopupId) markers.get(coordinatePopupId)?.element.classList.remove('is-card-open');
    const popup = coordinatePopup;
    coordinatePopup = null;
    coordinatePopupId = null;
    popup?.remove();
  };

  const captureMapView = () => {
    if (!map) return null;
    const center = map.getCenter();
    return {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      padding: map.getPadding()
    };
  };

  const sameMapView = (left, right) => Boolean(left && right)
    && Math.abs(left.center[0] - right.center[0]) < 0.0001
    && Math.abs(left.center[1] - right.center[1]) < 0.0001
    && Math.abs(left.zoom - right.zoom) < 0.01;

  const rememberMapView = () => {
    const view = captureMapView();
    if (!view || sameMapView(mapViewHistory[mapViewHistory.length - 1], view)) return;
    mapViewHistory.push(view);
    if (mapViewHistory.length > 8) mapViewHistory.shift();
    updateScope();
  };

  const restoreMapView = (view, duration = 980) => {
    if (!map || !view) return;
    map.easeTo({
      center: view.center,
      zoom: view.zoom,
      pitch: view.pitch,
      bearing: view.bearing,
      padding: view.padding,
      retainPadding: false,
      duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : duration,
      essential: true
    });
  };

  const closeCoordinateCardAndRestore = () => {
    const view = returnMapView;
    returnMapView = null;
    closeCoordinateCard();
    restoreMapView(view, 1150);
  };

  const galleryForItem = item => {
    const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
    if (!images.length) return null;

    const gallery = document.createElement('button');
    gallery.type = 'button';
    gallery.className = `zouguo-coordinate-gallery ${images.length === 1 ? 'is-single' : images.length === 2 ? 'is-pair' : 'is-multiple'}`;
    gallery.setAttribute(
      'aria-label',
      images.length > 1 ? `查看这枚走过的 ${images.length} 张照片` : '查看这枚走过的照片'
    );

    const photoLayer = (src, className, alt = '') => {
      const layer = document.createElement('span');
      layer.className = `zouguo-coordinate-photo ${className}`;
      const image = document.createElement('img');
      image.src = src;
      image.alt = alt;
      layer.appendChild(image);
      return layer;
    };

    if (images.length > 2) gallery.appendChild(photoLayer(images[2], 'is-tail'));
    if (images.length > 1) gallery.appendChild(photoLayer(images[1], 'is-back'));
    gallery.appendChild(photoLayer(images[0], 'is-front', `${item.place}的照片`));

    if (images.length > 1) {
      const count = document.createElement('span');
      count.className = 'zouguo-coordinate-count';
      count.textContent = `1 / ${images.length}`;
      gallery.appendChild(count);
    }

    gallery.addEventListener('click', event => {
      event.stopPropagation();
      cancelMapOrbit(true);
      if (window.ViewImage && typeof window.ViewImage.display === 'function') {
        window.ViewImage.display(images, images[0]);
      }
    });

    return gallery;
  };

  const coordinateCardForLocation = (location, entries, preferredItemId, syncSelection = true) => {
    let currentItem = entries.find(item => item.id === preferredItemId) || entries[0];
    const years = entries.map(item => Number(item.year)).filter(Number.isFinite);
    const yearRange = years.length ? `${Math.min(...years)}—${Math.max(...years)}` : '';

    const card = document.createElement('article');
    card.className = 'zouguo-coordinate-card';
    card.setAttribute('aria-label', `${location.name}的地点册`);
    card.addEventListener('click', event => event.stopPropagation());

    const topbar = document.createElement('div');
    topbar.className = 'zouguo-coordinate-topbar';

    const eyebrow = document.createElement('span');
    eyebrow.className = 'zouguo-coordinate-eyebrow';
    eyebrow.textContent = entries.length > 1
      ? `${entries.length} 次经过 · ${yearRange}`
      : `${currentItem.year} · ${currentItem.region}`;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'zouguo-coordinate-close';
    closeButton.setAttribute('aria-label', '收起地点册');
    closeButton.title = '收起地点册';
    const closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    closeIcon.setAttribute('aria-hidden', 'true');
    closeIcon.setAttribute('viewBox', '0 0 24 24');
    const closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    closePath.setAttribute('d', 'm7 10 5 5 5-5');
    closeIcon.appendChild(closePath);
    closeButton.appendChild(closeIcon);
    closeButton.addEventListener('click', event => {
      event.stopPropagation();
      closeCoordinateCardAndRestore();
    });
    topbar.append(eyebrow, closeButton);
    card.appendChild(topbar);

    const title = document.createElement('h3');
    title.textContent = location.name;
    card.appendChild(title);

    let dateRail = null;
    if (entries.length > 1) {
      dateRail = document.createElement('div');
      dateRail.className = 'zouguo-coordinate-date-rail';
      dateRail.setAttribute('role', 'group');
      dateRail.setAttribute('aria-label', '选择到访日期');
      entries.forEach(item => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.dataset.zouguoId = item.id;
        tab.textContent = `${item.date.slice(2, 4)}.${item.date.slice(5, 7)}.${item.date.slice(8, 10)}`;
        tab.addEventListener('click', event => {
          event.stopPropagation();
          renderItem(item);
        });
        dateRail.appendChild(tab);
      });
      card.appendChild(dateRail);
    }

    const record = document.createElement('div');
    record.className = 'zouguo-coordinate-record';

    const date = document.createElement('time');
    date.className = 'zouguo-coordinate-date';

    const media = document.createElement('div');
    media.className = 'zouguo-coordinate-media';

    const text = document.createElement('p');
    text.className = 'zouguo-coordinate-text';
    record.append(date, media, text);
    card.appendChild(record);

    function renderItem(item) {
      currentItem = item;
      const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
      card.classList.toggle('is-text-only', !images.length);
      date.dateTime = item.date;
      date.textContent = `${item.dateLabel} · 经过这里`;
      media.replaceChildren();
      const gallery = galleryForItem(item);
      if (gallery) media.appendChild(gallery);
      text.textContent = item.text;
      dateRail?.querySelectorAll('button').forEach(button => {
        const active = button.dataset.zouguoId === item.id;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (syncSelection) {
        selectZouguo(item.id, { scroll: false, moveMap: false, smooth: false });
      }
    }

    renderItem(currentItem);
    return card;
  };

  const openCoordinateCard = (location, entries, preferredItemId, syncSelection = true) => {
    if (!map || !entries.length) return;
    closeCoordinateCard({ cancelFocus: false, stopMap: false, keepTimelineRetracted: true });
    const focusWasInTimeline = Boolean(timelinePanel?.contains(document.activeElement));
    coordinatePopupId = location.id;
    root.classList.add('is-coordinate-card-open');
    markers.get(location.id)?.element.classList.add('is-card-open');
    const overlay = document.createElement('div');
    overlay.className = 'zouguo-coordinate-overlay';
    overlay.appendChild(coordinateCardForLocation(location, entries, preferredItemId, syncSelection));
    root.querySelector('.zouguo-map-panel')?.appendChild(overlay);
    coordinatePopup = overlay;
    if (focusWasInTimeline) {
      overlay.querySelector('.zouguo-coordinate-close')?.focus({ preventScroll: true });
    }
    setTimelineRetracted(true);
  };

  const waitForMapEvent = (eventName, timeout) => new Promise(resolve => {
    if (!map) {
      resolve();
      return;
    }
    let timer = null;
    const finish = () => {
      window.clearTimeout(timer);
      map.off(eventName, finish);
      resolve();
    };
    map.once(eventName, finish);
    timer = window.setTimeout(finish, timeout);
  });

  const waitForMapIdle = async timeout => {
    if (!map) return;
    if (!map.isMoving() && map.areTilesLoaded?.()) return;
    await waitForMapEvent('idle', timeout);
  };

  const animateMap = async (method, options, run, timeout) => {
    if (!map || run !== focusRun) return false;
    const finished = waitForMapEvent('moveend', timeout);
    map[method](options);
    await finished;
    return run === focusRun;
  };

  const cancelMapOrbit = stopMap => {
    if (!activeOrbitLocationId && !isOrbiting) return;
    orbitRun += 1;
    isOrbiting = false;
    activeOrbitLocationId = null;
    root.classList.remove('is-map-orbiting');
    if (stopMap && map?.isMoving()) map.stop();
  };

  const aerialPadding = withCard => {
    if (hasOverlayTimeline()) {
      const focusRightPadding = Math.max(220, timelineOverlayWidth() - 96);
      return {
        top: 42,
        right: withCard ? focusRightPadding : timelineOverlayWidth() + 48,
        bottom: 72,
        left: withCard ? 368 : 40
      };
    }
    if (!withCard) return { top: 42, right: 36, bottom: 72, left: 36 };
    const width = map?.getContainer()?.clientWidth || window.innerWidth;
    const right = width < 620
      ? Math.max(180, width - 120)
      : Math.min(360, Math.round(width * 0.44));
    return { top: 42, right, bottom: 72, left: 36 };
  };

  const orbitLocation = async (location, focusToken, withCard) => {
    if (!map || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Keep the 3D reveal, but do not leave the WebGL map rendering a full
    // 90-second revolution after every click. The shorter list motion also
    // avoids continuously repainting beneath the large glass panel.
    const motion = withCard
      ? { delay: 650, degrees: 54, duration: 13500 }
      : { delay: 320, degrees: 18, duration: 4800 };
    const run = ++orbitRun;
    await new Promise(resolve => window.setTimeout(resolve, motion.delay));
    if (run !== orbitRun || focusToken !== focusRun || activeOrbitLocationId !== location.id) return;

    const initialBearing = map.getBearing();
    isOrbiting = true;
    root.classList.add('is-map-orbiting');
    const finished = waitForMapEvent('moveend', motion.duration + 1200);
    map.easeTo({
      center: location.coordinates,
      zoom: map.getZoom(),
      pitch: 55,
      bearing: initialBearing + motion.degrees,
      padding: aerialPadding(withCard),
      retainPadding: false,
      duration: motion.duration,
      easing: progress => progress,
      essential: false
    });
    await finished;

    if (run === orbitRun) {
      isOrbiting = false;
      activeOrbitLocationId = null;
      root.classList.remove('is-map-orbiting');
    }
  };

  const focusLocation = async (location, options) => {
    const settings = Object.assign({
      showCard: true,
      itemId: null,
      toggleClose: true,
      syncSelection: true
    }, options || {});
    const entries = visibleEntriesForLocation(location);
    if (!map || !entries.length) return;
    if (settings.showCard) timelineFocusId = null;
    if (settings.showCard && !settings.syncSelection) clearZouguoSelection();

    const shouldClose = settings.showCard
      && settings.toggleClose
      && (coordinatePopupId === location.id || focusingLocationId === location.id);
    if (shouldClose) {
      closeCoordinateCardAndRestore();
      return;
    }
    if (settings.showCard && !coordinatePopupId && !focusingLocationId) {
      returnMapView = captureMapView();
    }
    const run = ++focusRun;
    closeCoordinateCard({
      cancelFocus: false,
      stopMap: false,
      keepTimelineRetracted: root.classList.contains('is-timeline-retracted')
    });
    map.stop();

    focusingLocationId = location.id;
    root.classList.add('is-location-focusing');
    markers.get(location.id)?.element.classList.add('is-focusing');
    const selectedEntry = entries.find(item => item.id === settings.itemId) || entries[0];
    if (settings.syncSelection) {
      selectZouguo(selectedEntry.id, { scroll: false, moveMap: false, smooth: false });
    }

    if (!map.isStyleLoaded()) {
      await waitForMapEvent('style.load', 1800);
      if (run !== focusRun) return;
    }
    await waitForMapIdle(1000);
    if (run !== focusRun) return;

    const center = map.getCenter();
    const nearby = map.getZoom() >= 10.8
      && Math.abs(center.lng - location.coordinates[0]) < 0.22
      && Math.abs(center.lat - location.coordinates[1]) < 0.18;

    if (!nearby) {
      const arrived = await animateMap('flyTo', {
        center: location.coordinates,
        zoom: 11.35,
        pitch: 0,
        bearing: 0,
        padding: mapViewportPadding(40),
        retainPadding: false,
        duration: 720,
        curve: 1.28,
        essential: true
      }, run, 1300);
      if (!arrived) return;
      await waitForMapIdle(900);
      if (run !== focusRun) return;
    }

    const settled = await animateMap('easeTo', {
      center: location.coordinates,
      zoom: 15.4,
      pitch: 55,
      bearing: -18,
      padding: aerialPadding(settings.showCard),
      retainPadding: false,
      duration: nearby ? 720 : 860,
      essential: true
    }, run, 1400);
    if (!settled) return;

    await waitForMapIdle(1800);
    if (run !== focusRun) return;

    markers.get(location.id)?.element.classList.remove('is-focusing');
    focusingLocationId = null;
    root.classList.remove('is-location-focusing');
    if (settings.showCard) {
      openCoordinateCard(location, entries, settings.itemId, settings.syncSelection);
    }
    activeOrbitLocationId = location.id;
    orbitLocation(location, run, settings.showCard);
  };

  const selectZouguo = (id, options) => {
    const item = itemsById.get(id);
    if (!item || (activeYear !== 'all' && item.year !== activeYear)) return;

    const settings = Object.assign({ scroll: false, moveMap: true, smooth: true }, options || {});
    selectedId = id;
    const selectedLocationId = itemLocationIds.get(id);

    cards.forEach(card => {
      const active = card.dataset.zouguoId === id;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-current', active ? 'true' : 'false');
    });

    markers.forEach((entry, locationId) => {
      entry.element.classList.toggle('is-active', locationId === selectedLocationId);
    });
    clusterMarkers.forEach(entry => {
      entry.element.classList.toggle('is-active', entry.locationIds.includes(selectedLocationId));
    });

    updateCaption();

    if (settings.scroll) {
      const card = cards.find(candidate => candidate.dataset.zouguoId === id);
      if (card) {
        card.scrollIntoView({ behavior: settings.smooth ? 'smooth' : 'auto', block: 'center' });
      }
    }

    if (map && settings.moveMap) {
      map.easeTo({
        center: item.coordinates,
        zoom: 11.2,
        pitch: 0,
        bearing: 0,
        padding: mapViewportPadding(36),
        retainPadding: false,
        duration: settings.smooth ? 950 : 0,
        essential: true
      });
    }
  };

  const clearZouguoSelection = () => {
    selectedId = null;
    cards.forEach(card => {
      card.classList.remove('is-active');
      card.setAttribute('aria-current', 'false');
    });
    markers.forEach(entry => entry.element.classList.remove('is-active'));
    clusterMarkers.forEach(entry => entry.element.classList.remove('is-active'));
    updateCaption();
  };

  const fitVisibleItems = animate => {
    if (!map || typeof mapboxgl === 'undefined') return;
    const currentItems = visibleItems();
    if (!currentItems.length) return;

    const longitudes = currentItems.map(item => item.coordinates[0]);
    const latitudes = currentItems.map(item => item.coordinates[1]);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const lngPadding = Math.max((maxLng - minLng) * 0.12, 0.34);
    const latPadding = Math.max((maxLat - minLat) * 0.12, 0.28);
    const bounds = new mapboxgl.LngLatBounds(
      [minLng - lngPadding, minLat - latPadding],
      [maxLng + lngPadding, maxLat + latPadding]
    );
    map.fitBounds(bounds, {
      padding: window.innerWidth < 760 ? 30 : mapViewportPadding(44),
      maxZoom: 8.2,
      pitch: 0,
      bearing: 0,
      retainPadding: false,
      duration: animate ? 1100 : 0,
      essential: true
    });
  };

  const featureCollectionForCodes = (collection, property, codes) => {
    if (!collection || !codes.size) return emptyFeatureCollection();
    return {
      type: 'FeatureCollection',
      features: collection.features.filter(feature => codes.has(String(feature.properties?.[property] || '')))
    };
  };

  const boundaryDataForVisibleItems = () => {
    const currentItems = visibleItems();
    const countryCodes = new Set(currentItems.map(item => item.countryCode).filter(Boolean).map(String));
    const provinceCodes = new Set(currentItems.map(item => item.provinceCode).filter(Boolean).map(String));
    const cityCodes = new Set(currentItems.map(item => item.cityCode).filter(Boolean).map(String));

    return {
      country: featureCollectionForCodes(boundaryCollections?.country, 'groupCode', countryCodes),
      province: featureCollectionForCodes(boundaryCollections?.province, 'groupCode', provinceCodes),
      city: featureCollectionForCodes(boundaryCollections?.city, 'groupCode', cityCodes)
    };
  };

  const updateBoundarySources = () => {
    if (!map || !boundaryCollections) return;
    const data = boundaryDataForVisibleItems();
    Object.entries(boundarySourceIds).forEach(([level, sourceId]) => {
      map.getSource(sourceId)?.setData(data[level]);
    });
  };

  const boundaryPaint = () => {
    const dark = isDarkTheme();
    return dark
      ? {
          fill: '#b76551',
          line: '#c5826f',
          fillEmissiveStrength: 0.68,
          lineEmissiveStrength: 0.72,
          lineOpacity: 0.58,
          opacities: { country: 0.15, province: 0.2, city: 0.26 }
        }
      : {
          fill: '#bd6b55',
          line: '#9d4f3d',
          fillEmissiveStrength: 0.12,
          lineEmissiveStrength: 0.16,
          lineOpacity: 0.68,
          opacities: { country: 0.12, province: 0.17, city: 0.23 }
        };
  };

  const ensureBoundaryLayers = () => {
    if (!map || !boundaryCollections || !map.isStyleLoaded()) return;
    try {
      const data = boundaryDataForVisibleItems();
      const colors = boundaryPaint();
      Object.entries(boundarySourceIds).forEach(([level, sourceId]) => {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: data[level],
            maxzoom: 11,
            buffer: 32,
            tolerance: 1.5
          });
        }
      });

      const levels = [
        {
          key: 'country',
          minzoom: 0,
          maxzoom: 4.05,
          width: 1
        },
        {
          key: 'province',
          minzoom: 4,
          maxzoom: 6.6,
          width: 1.15
        },
        {
          key: 'city',
          minzoom: 6.5,
          maxzoom: 10.8,
          width: 1.3
        }
      ];

      levels.forEach(level => {
        const fillId = `${boundarySourceIds[level.key]}-fill`;
        const lineId = `${boundarySourceIds[level.key]}-line`;
        if (!map.getLayer(fillId)) {
          map.addLayer({
            id: fillId,
            type: 'fill',
            source: boundarySourceIds[level.key],
            slot: 'bottom',
            minzoom: level.minzoom,
            maxzoom: level.maxzoom,
            paint: {
              'fill-color': colors.fill,
              'fill-opacity': colors.opacities[level.key],
              'fill-emissive-strength': colors.fillEmissiveStrength
            }
          });
        }
        if (!map.getLayer(lineId)) {
          map.addLayer({
            id: lineId,
            type: 'line',
            source: boundarySourceIds[level.key],
            slot: 'middle',
            minzoom: level.minzoom,
            maxzoom: level.maxzoom,
            paint: {
              'line-color': colors.line,
              'line-opacity': colors.lineOpacity,
              'line-width': level.width,
              'line-emissive-strength': colors.lineEmissiveStrength
            }
          });
        }
      });

      root.classList.add('is-boundary-ready');
      root.classList.remove('is-boundary-error');
      delete root.dataset.boundaryError;
      updateBoundarySources();
      updateScope();
    } catch (error) {
      root.classList.add('is-boundary-error');
      root.dataset.boundaryError = String(error?.message || error || 'Unknown boundary layer error');
      console.warn('Zouguo boundary layers unavailable.', error);
    }
  };

  const queueBoundaryLayers = () => {
    if (!map || !boundaryCollections) return;
    if (map.isStyleLoaded()) {
      ensureBoundaryLayers();
      return;
    }
    map.once('idle', ensureBoundaryLayers);
  };

  const loadBoundaries = async () => {
    if (!boundaryDataUrl) return;

    try {
      const response = await fetch(boundaryDataUrl, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Boundary request failed: ${response.status}`);
      const collection = asFeatureCollection(await response.json());
      boundaryCollections = {
        country: { type: 'FeatureCollection', features: collection.features.filter(feature => feature.properties?.level === 'country') },
        province: { type: 'FeatureCollection', features: collection.features.filter(feature => feature.properties?.level === 'province') },
        city: { type: 'FeatureCollection', features: collection.features.filter(feature => feature.properties?.level === 'city') }
      };
      queueBoundaryLayers();
    } catch (error) {
      root.classList.add('is-boundary-error');
      root.dataset.boundaryError = String(error?.message || error || 'Unknown boundary data error');
      console.warn('Zouguo boundary data unavailable.', error);
    }
  };

  const previewItemForLocation = location => {
    const entries = visibleEntriesForLocation(location);
    return entries.find(item => Array.isArray(item.images) && item.images.length) || entries[0] || location.items[0];
  };

  const renderPreviewDisc = (disc, item) => {
    disc.replaceChildren();
    const image = Array.isArray(item?.images) ? item.images.find(Boolean) : null;
    disc.classList.toggle('is-text-only', !image);
    if (image) {
      const preview = document.createElement('img');
      preview.src = image;
      preview.alt = '';
      disc.appendChild(preview);
    }
  };

  const createMarkerElement = location => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'zouguo-map-marker';

    const historyDisc = document.createElement('span');
    historyDisc.className = 'zouguo-map-marker-history';
    historyDisc.setAttribute('aria-hidden', 'true');
    historyDisc.hidden = true;
    button.appendChild(historyDisc);

    const previewItem = location.items.find(item => Array.isArray(item.images) && item.images.length) || location.items[0];
    const hasImages = Array.isArray(previewItem?.images) && previewItem.images.length > 0;
    if (hasImages) {
      const frame = document.createElement('span');
      frame.className = 'zouguo-map-marker-frame';
      const image = document.createElement('img');
      image.src = previewItem.images[0];
      image.alt = '';
      frame.appendChild(image);
      button.appendChild(frame);
    } else {
      button.classList.add('is-text-only');
      const dot = document.createElement('span');
      dot.className = 'zouguo-map-marker-dot';
      button.appendChild(dot);
    }

    button.addEventListener('click', event => {
      event.stopPropagation();
      focusLocation(location, { syncSelection: false });
    });
    return button;
  };

  const updateLocationMarker = (location, entry) => {
    const visibleEntries = visibleEntriesForLocation(location);
    entry.element.classList.toggle('is-hidden', !visibleEntries.length);
    entry.element.classList.remove('is-clustered');
    entry.element.setAttribute(
      'aria-label',
      visibleEntries.length > 1
        ? `查看 ${location.name} 的 ${visibleEntries.length} 条走过`
        : `查看 ${location.name} 的走过`
    );
    const historyDisc = entry.element.querySelector('.zouguo-map-marker-history');
    const photoEntries = visibleEntries.filter(item => Array.isArray(item.images) && item.images.some(Boolean));
    const hasPhotoHistory = photoEntries.length > 1;
    entry.element.classList.toggle('has-history', hasPhotoHistory);
    if (historyDisc) {
      historyDisc.hidden = !hasPhotoHistory;
      if (hasPhotoHistory) {
        renderPreviewDisc(historyDisc, photoEntries[1]);
      }
    }
  };

  const clearClusterMarkers = () => {
    clusterMarkers.forEach(entry => entry.marker.remove());
    clusterMarkers = [];
  };

  const expandLocationCluster = locationIds => {
    closeCoordinateCard();
    const members = locationIds.map(id => locationsById.get(id)).filter(Boolean);
    if (!map || !members.length || typeof mapboxgl === 'undefined') return;
    rememberMapView();

    const bounds = new mapboxgl.LngLatBounds();
    members.forEach(location => bounds.extend(location.coordinates));
    map.fitBounds(bounds, {
      padding: window.innerWidth < 760 ? 74 : mapViewportPadding(88),
      maxZoom: 13.45,
      pitch: 0,
      bearing: 0,
      retainPadding: false,
      duration: 1050,
      essential: true
    });
  };

  const createClusterElement = locationIds => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'zouguo-map-cluster';
    button.setAttribute('aria-label', `${locationIds.length} 个附近地点，放大查看`);

    const previewLocations = locationIds
      .map(id => locationsById.get(id))
      .filter(Boolean)
      .filter(location => Boolean(previewItemForLocation(location)?.images?.find(Boolean)))
      .slice(0, 2);

    if (!previewLocations.length) {
      const disc = document.createElement('span');
      disc.className = 'zouguo-map-cluster-disc is-single is-text-only';
      disc.setAttribute('aria-hidden', 'true');
      button.appendChild(disc);
    }

    previewLocations.forEach((location, index) => {
      const disc = document.createElement('span');
      disc.className = previewLocations.length === 1
        ? 'zouguo-map-cluster-disc is-single'
        : `zouguo-map-cluster-disc is-${index === 0 ? 'back' : 'front'}`;
      disc.setAttribute('aria-hidden', 'true');
      renderPreviewDisc(disc, previewItemForLocation(location));
      button.appendChild(disc);
    });
    button.addEventListener('click', event => {
      event.stopPropagation();
      expandLocationCluster(locationIds);
    });
    return button;
  };

  const refreshLocationMarkers = () => {
    if (!map) return;
    clearClusterMarkers();

    const candidates = locations
      .map(location => ({ location, entry: markers.get(location.id) }))
      .filter(candidate => candidate.entry && visibleEntriesForLocation(candidate.location).length);

    locations.forEach(location => {
      const entry = markers.get(location.id);
      if (entry) updateLocationMarker(location, entry);
    });

    if (map.getZoom() >= 13.15) return;

    const clusters = [];
    candidates.forEach(candidate => {
      const point = map.project(candidate.location.coordinates);
      let cluster = clusters.find(current => {
        const dx = point.x - current.center.x;
        const dy = point.y - current.center.y;
        return Math.hypot(dx, dy) < 58;
      });
      if (!cluster) {
        cluster = { members: [], points: [], center: { x: point.x, y: point.y } };
        clusters.push(cluster);
      }
      cluster.members.push(candidate);
      cluster.points.push(point);
      cluster.center = {
        x: cluster.points.reduce((sum, value) => sum + value.x, 0) / cluster.points.length,
        y: cluster.points.reduce((sum, value) => sum + value.y, 0) / cluster.points.length
      };
    });

    clusters.filter(cluster => cluster.members.length > 1).forEach(cluster => {
      const locationIds = cluster.members.map(member => member.location.id);
      cluster.members.forEach(member => member.entry.element.classList.add('is-clustered'));
      const coordinates = [
        cluster.members.reduce((sum, member) => sum + member.location.coordinates[0], 0) / cluster.members.length,
        cluster.members.reduce((sum, member) => sum + member.location.coordinates[1], 0) / cluster.members.length
      ];
      const element = createClusterElement(locationIds);
      element.classList.toggle('is-active', locationIds.includes(itemLocationIds.get(selectedId)));
      const marker = new mapboxgl.Marker({ element, anchor: 'center' })
        .setLngLat(coordinates)
        .addTo(map);
      clusterMarkers.push({ marker, element, locationIds });
    });
  };

  const setupMap = () => {
    const token = root.dataset.mapboxToken;
    if (typeof mapboxgl === 'undefined' || !token) {
      root.classList.add('is-map-error');
      return;
    }

    mapboxgl.accessToken = token;
    currentMapStyle = mapStyle();
    map = new mapboxgl.Map({
      container: 'zouguo-map',
      style: currentMapStyle,
      projection: 'mercator',
      language: 'zh-Hans',
      localIdeographFontFamily: "'PingFang SC', 'Noto Sans CJK SC', sans-serif",
      center: [112.8, 30.2],
      zoom: 3.3,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      logoPosition: 'bottom-left'
    });
    locations.forEach(location => {
      const element = createMarkerElement(location);
      const marker = new mapboxgl.Marker({ element, anchor: 'bottom', offset: [0, -4] })
        .setLngLat(location.coordinates)
        .addTo(map);
      markers.set(location.id, { marker, element });
    });

    map.on('load', () => {
      root.classList.add('is-map-ready');
      applyBasemapPresentation();
      map.resize();
      fitVisibleItems(false);
      queueBoundaryLayers();
      refreshLocationMarkers();
      updateScope();
    });

    map.on('style.load', () => {
      basemapLabelsConfigured = false;
      basemapPlaceLabelsVisible = null;
      basemapRoadLabelsVisible = null;
      applyBasemapPresentation();
      queueBoundaryLayers();
    });
    map.on('zoomend', () => {
      updateScope();
      syncBasemapLabels();
    });
    map.on('moveend', refreshLocationMarkers);
    map.on('moveend', updateScopeAfterMove);
    map.on('dragstart', () => closeCoordinateCard({ stopMap: false }));
    map.on('mousedown', () => cancelMapOrbit(true));
    map.on('touchstart', () => cancelMapOrbit(true));
    map.on('wheel', () => cancelMapOrbit(true));

    map.on('error', event => {
      if (!event?.error) return;
      root.classList.add('is-map-error');
    });

    const updateTheme = () => {
      if (!map) return;
      const nextStyle = mapStyle();
      if (nextStyle && nextStyle !== currentMapStyle) {
        currentMapStyle = nextStyle;
        basemapLabelsConfigured = false;
        basemapPlaceLabelsVisible = null;
        basemapRoadLabelsVisible = null;
        map.setStyle(nextStyle);
      } else {
        applyBasemapPresentation();
      }
    };

    new MutationObserver(updateTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (!document.documentElement.getAttribute('data-theme')) updateTheme();
      });
    }

    if (window.ResizeObserver) {
      new ResizeObserver(() => map?.resize()).observe(root.querySelector('.zouguo-map-panel'));
    }

    loadBoundaries();
  };

  const filterByYear = year => {
    closeCoordinateCard();
    timelineFocusId = null;
    returnMapView = null;
    mapViewHistory = [];
    activeYear = year;
    updateTimelineDates();
    filterButtons.forEach(button => {
      const active = button.dataset.year === year;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    cards.forEach(card => {
      card.hidden = year !== 'all' && card.dataset.year !== year;
    });

    clearZouguoSelection();
    refreshLocationMarkers();

    updateBoundarySources();

    updateCaption();
    window.setTimeout(() => fitVisibleItems(true), 50);
  };

  cards.forEach(card => {
    const activate = () => {
      const item = itemsById.get(card.dataset.zouguoId);
      const location = locationsById.get(itemLocationIds.get(card.dataset.zouguoId));
      if (!item || !location) return;

      if (timelineFocusId === item.id) {
        timelineFocusId = null;
        closeCoordinateCard();
        clearZouguoSelection();
        const previousView = mapViewHistory.pop();
        if (previousView) restoreMapView(previousView, 1150);
        else fitVisibleItems(true);
        return;
      }

      if (!timelineFocusId) rememberMapView();
      timelineFocusId = item.id;
      focusLocation(location, { showCard: false, itemId: item.id });
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', event => {
      if (event.target !== card) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });

  entryGalleries.forEach(gallery => {
    gallery.addEventListener('click', event => {
      event.stopPropagation();
      const card = gallery.closest('[data-zouguo-id]');
      const item = itemsById.get(card?.dataset.zouguoId);
      const images = Array.isArray(item?.images) ? item.images.filter(Boolean) : [];
      if (!images.length) return;

      const photo = event.target.closest('[data-image-index]');
      const imageIndex = Math.max(0, Math.min(images.length - 1, Number(photo?.dataset.imageIndex) || 0));
      cancelMapOrbit(true);
      if (window.ViewImage && typeof window.ViewImage.display === 'function') {
        window.ViewImage.display(images, images[imageIndex]);
      }
    });
  });

  filterButtons.forEach(button => {
    button.addEventListener('click', () => filterByYear(button.dataset.year || 'all'));
  });

  overviewButton?.addEventListener('click', () => {
    closeCoordinateCard();
    timelineFocusId = null;
    clearZouguoSelection();
    returnMapView = null;
    mapViewHistory = [];
    fitVisibleItems(true);
  });

  const returnToPreviousScope = () => {
    if (!map || document.querySelector('.view-image')) return;
    if (coordinatePopup || focusingLocationId) {
      closeCoordinateCardAndRestore();
      return;
    }

    closeCoordinateCard();
    timelineFocusId = null;
    clearZouguoSelection();
    const rememberedView = mapViewHistory.pop();
    if (rememberedView) {
      restoreMapView(rememberedView);
      return;
    }

    const scope = mapScopeIndex();
    if (scope <= 0) return;
    if (scope === 1) {
      fitVisibleItems(true);
      return;
    }

    map.easeTo({
      center: map.getCenter(),
      zoom: scope === 3 ? 8.1 : 5.3,
      pitch: 0,
      bearing: 0,
      padding: mapViewportPadding(36),
      retainPadding: false,
      duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 920,
      essential: true
    });
  };

  scopeBackButton?.addEventListener('click', returnToPreviousScope);
  timelineRevealButton?.addEventListener('click', () => {
    const willRetract = !root.classList.contains('is-timeline-retracted');
    if (!willRetract) cancelMapOrbit(true);
    setTimelineRetracted(willRetract);
  });

  randomButton?.addEventListener('click', () => {
    const candidates = visibleItems().filter(item => (
      item.id !== randomItemId && item.id !== selectedId
    ));
    const pool = candidates.length ? candidates : visibleItems();
    const item = pool[Math.floor(Math.random() * pool.length)];
    const location = item && locationsById.get(itemLocationIds.get(item.id));
    if (item && location) {
      randomItemId = item.id;
      focusLocation(location, {
        showCard: true,
        itemId: item.id,
        toggleClose: false,
        syncSelection: false
      });
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!coordinatePopup && !focusingLocationId)) return;
    if (document.querySelector('.view-image')) return;
    closeCoordinateCardAndRestore();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelMapOrbit(true);
  });

  if ('IntersectionObserver' in window) {
    const stage = root.querySelector('.zouguo-stage');
    const stageObserver = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) cancelMapOrbit(true);
    }, { threshold: 0.08 });
    if (stage) stageObserver.observe(stage);
  }

  window.matchMedia?.('(min-width: 861px)').addEventListener('change', () => {
    setTimelineRetracted(Boolean(coordinatePopup || focusingLocationId));
  });

  updateTimelineDates();
  updateCaption();
  setupMap();
})();
