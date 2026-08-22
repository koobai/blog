(function() {
  'use strict';

  const modules = window.JingzheExerciseModules = window.JingzheExerciseModules || {};

  const decodePolyline = (encoded, precision = 5) => {
    if (!encoded) return [];
    let index = 0;
    let latitude = 0;
    let longitude = 0;
    const coordinates = [];
    const factor = Math.pow(10, precision);

    try {
      while (index < encoded.length) {
        const values = [];
        for (let field = 0; field < 2; field += 1) {
          let shift = 0;
          let result = 0;
          let byte;
          do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
          } while (byte >= 0x20);
          values.push((result & 1) ? ~(result >> 1) : (result >> 1));
        }
        latitude += values[0];
        longitude += values[1];
        coordinates.push([longitude / factor, latitude / factor]);
      }
    } catch (_error) {
      return [];
    }
    return coordinates;
  };

  const coordinateDistanceKm = (from, to) => {
    const earthRadiusKm = 6371;
    const toRadians = value => value * Math.PI / 180;
    const latitudeDelta = toRadians(to[1] - from[1]);
    const longitudeDelta = toRadians(to[0] - from[0]);
    const value = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(toRadians(from[1])) * Math.cos(toRadians(to[1]))
      * Math.sin(longitudeDelta / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.sqrt(value));
  };

  const appendCoordinatesUntilDistance = (output, coordinates, distanceLeftKm) => {
    let remaining = distanceLeftKm;
    for (let index = 1; index < coordinates.length && remaining > 0; index += 1) {
      const start = output[output.length - 1];
      const end = coordinates[index];
      const segmentDistance = coordinateDistanceKm(start, end);
      if (segmentDistance <= remaining + 0.000001) {
        output.push(end);
        remaining -= segmentDistance;
        continue;
      }
      const ratio = segmentDistance > 0 ? remaining / segmentDistance : 0;
      output.push([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio
      ]);
      remaining = 0;
    }
    return remaining;
  };

  const getRouteStampCopy = (run) => {
    if (run.is_indoor === true) {
      return { reason: '室内运动没有定位轨迹', tagline: '室内开练，地图休息' };
    }
    if (run.route_status === 'privacy_hidden') {
      return { reason: '定位轨迹未公开', tagline: '轨迹留白，运动没停' };
    }
    return { reason: '本次没有定位轨迹', tagline: '没有轨迹，运动照常' };
  };

  modules.createRoutes = (runtime, mapCenter) => {
    const routeLibrary = Array.isArray(runtime.landmarkRoutes) ? runtime.landmarkRoutes : [];
    const routesByKey = new Map(routeLibrary.map(route => [route.key, route]));

    const getLandmarkRouteForRun = (run) => routesByKey.get(run.distance_title_key) || null;

    const routePassCount = (route, run) => {
      const referenceMeters = Number(route.reference_meters);
      const elevationMeters = Number(run.total_elevation_gain);
      if (Number.isFinite(referenceMeters) && referenceMeters > 0
        && Number.isFinite(elevationMeters) && elevationMeters > 0) {
        return elevationMeters / referenceMeters;
      }
      const referenceKm = Number(route.reference_km);
      const distanceKm = Number(run.distance);
      if (Number.isFinite(referenceKm) && referenceKm > 0
        && Number.isFinite(distanceKm) && distanceKm > 0) {
        return distanceKm / referenceKm;
      }
      return 0;
    };

    const coordinatesForRunRoute = (route, run) => {
      const baseCoordinates = decodePolyline(route.geometry || '');
      const passCount = routePassCount(route, run);
      if (baseCoordinates.length < 2 || !Number.isFinite(passCount) || passCount <= 0) return [];
      if (passCount >= 1) return baseCoordinates;

      const output = [baseCoordinates[0]];
      const baseDistanceKm = baseCoordinates.slice(1).reduce(
        (total, coordinate, index) => (
          total + coordinateDistanceKm(baseCoordinates[index], coordinate)
        ),
        0
      );
      appendCoordinatesUntilDistance(output, baseCoordinates, baseDistanceKm * passCount);
      return output;
    };

    const singleRouteLineWidth = (route, run) => (
      3.4 + Math.min(Math.max(routePassCount(route, run), 0.5), 6) * 0.65
    );

    const selectDisplayRoute = (run) => {
      // Privacy invariant: a hidden activity never decodes or draws its own polyline.
      const realCoordinates = run.route_status === 'available' && run.summary_polyline
        ? (run._decodedCoords || decodePolyline(run.summary_polyline))
        : [];
      if (run.route_status === 'available') run._decodedCoords = realCoordinates;
      const hasRealTrack = run.route_status === 'available' && realCoordinates.length >= 2;
      const landmarkRoute = run.route_status === 'privacy_hidden'
        ? getLandmarkRouteForRun(run)
        : null;
      const landmarkCoordinates = landmarkRoute
        ? coordinatesForRunRoute(landmarkRoute, run)
        : [];
      const displayCoordinates = hasRealTrack ? realCoordinates : landmarkCoordinates;
      return {
        hasRealTrack,
        landmarkRoute,
        displayCoordinates,
        hasDisplayTrack: displayCoordinates.length >= 2
      };
    };

    const buildRouteOverview = (targetYear, targetMonth = null) => {
      const periodPrefix = targetMonth
        ? `${targetYear}-${String(targetMonth).padStart(2, '0')}`
        : String(targetYear);
      const runs = (runtime.data || []).filter(run => (
        run.start_date_local?.startsWith(periodPrefix) && run.is_indoor !== true
      ));
      const landmarkGroups = new Map();
      runs.forEach(run => {
        if (run.route_status !== 'privacy_hidden' || !run.distance_title_key) return;
        if (!landmarkGroups.has(run.distance_title_key)) {
          landmarkGroups.set(run.distance_title_key, []);
        }
        landmarkGroups.get(run.distance_title_key).push(run);
      });

      const landmarkFeatures = [...landmarkGroups.entries()]
        .map(([key, groupRuns]) => {
          const landmarkRoute = routesByKey.get(key) || null;
          if (!landmarkRoute) return null;
          const run = [...groupRuns].sort(
            (left, right) => routePassCount(landmarkRoute, right) - routePassCount(landmarkRoute, left)
          )[0];
          const coordinates = coordinatesForRunRoute(landmarkRoute, run);
          if (coordinates.length < 2) return null;
          return {
            type: 'Feature',
            properties: {
              id: Number(run.run_id),
              landmark: key,
              type: run.type,
              visits: groupRuns.length,
              mode: targetMonth ? 'month' : 'annual'
            },
            geometry: { type: 'LineString', coordinates }
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.properties.visits - right.properties.visits);

      const publicFeatures = runs
        .filter(run => run.route_status === 'available' && run.summary_polyline)
        .map(run => {
          const coordinates = run._decodedCoords || decodePolyline(run.summary_polyline);
          run._decodedCoords = coordinates;
          if (coordinates.length < 2) return null;
          const routeCenter = coordinates[Math.floor(coordinates.length / 2)];
          if (coordinateDistanceKm(mapCenter, routeCenter) > 120) return null;
          return {
            type: 'Feature',
            properties: { id: Number(run.run_id), type: run.type },
            geometry: { type: 'LineString', coordinates }
          };
        })
        .filter(Boolean);

      return { landmarkFeatures, publicFeatures };
    };

    const buildAnnualOverview = targetYear => buildRouteOverview(targetYear);
    const buildMonthlyOverview = (targetYear, targetMonth) => buildRouteOverview(targetYear, targetMonth);

    return {
      buildAnnualOverview,
      buildMonthlyOverview,
      coordinatesForRunRoute,
      getLandmarkRouteForRun,
      getRouteStampCopy,
      routePassCount,
      selectDisplayRoute,
      singleRouteLineWidth
    };
  };

  modules.routePrimitives = {
    appendCoordinatesUntilDistance,
    coordinateDistanceKm,
    decodePolyline,
    getRouteStampCopy
  };
})();
