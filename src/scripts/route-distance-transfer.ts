export const ROUTE_DISTANCE_EVENT = "f2:route-distance";
export const ROUTE_DISTANCE_STORAGE_KEY = "f2.route-distance-meters";

type RouteDistanceDetail = {
  distanceMeters: number;
};

const parseDistance = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
};

export const publishRouteDistance = (distanceMeters: number): void => {
  const parsedDistance = parseDistance(distanceMeters);

  if (parsedDistance === null) {
    return;
  }

  localStorage.setItem(ROUTE_DISTANCE_STORAGE_KEY, String(parsedDistance));

  window.dispatchEvent(
    new CustomEvent<RouteDistanceDetail>(ROUTE_DISTANCE_EVENT, {
      detail: { distanceMeters: parsedDistance },
    }),
  );
};

export const readStoredRouteDistance = (): number | null => {
  const value = localStorage.getItem(ROUTE_DISTANCE_STORAGE_KEY);

  if (value === null) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return parseDistance(parsed);
};

export const clearStoredRouteDistance = (): void => {
  localStorage.removeItem(ROUTE_DISTANCE_STORAGE_KEY);
};
