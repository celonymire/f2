import { publishRouteDistance } from "./route-distance-transfer";

type LngLat = [number, number];

type Waypoint = {
  id: string;
  coordinates: LngLat;
};

type PlannerProfile = "foot-walking" | "foot-hiking";

type PlannedRoute = {
  id: string;
  name: string;
  profile: PlannerProfile;
  waypoints: Waypoint[];
  geometry: LngLat[];
  distanceMeters: number;
  durationSeconds: number;
  isRouted: boolean;
  updatedAt: string;
};

type PlannerStorage = {
  version: 1;
  apiKey: string;
  routes: PlannedRoute[];
  activeRouteId: string | null;
};

const STORAGE_KEY = "f2.route-planner.v1";
const VIEWPORT_STORAGE_KEY = "f2.route-planner.viewport.v1";
const ROUTE_SOURCE_ID = "planner-route-source";
const ROUTE_CASING_LAYER_ID = "planner-route-casing-layer";
const ROUTE_LAYER_ID = "planner-route-layer";
const DEFAULT_CENTER: LngLat = [-123.1207, 49.2827];
const DEFAULT_ZOOM = 12;

type StoredViewport = {
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
};

const createId = (): string => {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = (): string => new Date().toISOString();

const isLngLat = (value: unknown): value is LngLat => {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }

  const [lng, lat] = value;
  return (
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    typeof lat === "number" &&
    Number.isFinite(lat)
  );
};

const toLngLat = (value: unknown): LngLat | null => {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const lng = value[0];
  const lat = value[1];

  if (
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    typeof lat !== "number" ||
    !Number.isFinite(lat)
  ) {
    return null;
  }

  return [lng, lat];
};

const isPlannerProfile = (value: unknown): value is PlannerProfile =>
  value === "foot-walking" || value === "foot-hiking";

const formatDistance = (meters: number): string => {
  if (!Number.isFinite(meters) || meters <= 0) {
    return "0.00 km";
  }

  return `${(meters / 1000).toFixed(2)} km`;
};

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00:00";
  }

  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((rounded % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (rounded % 60).toString().padStart(2, "0");

  return `${hours}:${minutes}:${remainingSeconds}`;
};

const calculateSegmentDistance = (start: LngLat, end: LngLat): number => {
  const toRadians = (value: number): number => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const [startLng, startLat] = start;
  const [endLng, endLat] = end;
  const deltaLat = toRadians(endLat - startLat);
  const deltaLng = toRadians(endLng - startLng);
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const angularDistance =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMeters * angularDistance;
};

const calculatePathDistance = (coordinates: LngLat[]): number => {
  let totalDistance = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    totalDistance += calculateSegmentDistance(
      coordinates[index - 1],
      coordinates[index],
    );
  }

  return totalDistance;
};

const createEmptyRoute = (index: number): PlannedRoute => ({
  id: createId(),
  name: `Route ${index}`,
  profile: "foot-walking",
  waypoints: [],
  geometry: [],
  distanceMeters: 0,
  durationSeconds: 0,
  isRouted: false,
  updatedAt: nowIso(),
});

const parseWaypoint = (value: unknown): Waypoint | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { id?: unknown; coordinates?: unknown };

  if (typeof candidate.id !== "string" || !isLngLat(candidate.coordinates)) {
    return null;
  }

  return { id: candidate.id, coordinates: candidate.coordinates };
};

const parseRoute = (value: unknown): PlannedRoute | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    name?: unknown;
    profile?: unknown;
    waypoints?: unknown;
    geometry?: unknown;
    distanceMeters?: unknown;
    durationSeconds?: unknown;
    isRouted?: unknown;
    updatedAt?: unknown;
  };

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    !isPlannerProfile(candidate.profile) ||
    !Array.isArray(candidate.waypoints) ||
    !Array.isArray(candidate.geometry) ||
    typeof candidate.distanceMeters !== "number" ||
    !Number.isFinite(candidate.distanceMeters) ||
    typeof candidate.durationSeconds !== "number" ||
    !Number.isFinite(candidate.durationSeconds) ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  const parsedWaypoints = candidate.waypoints
    .map((waypoint) => parseWaypoint(waypoint))
    .filter((waypoint): waypoint is Waypoint => waypoint !== null);
  const parsedGeometry = candidate.geometry
    .map((coordinate) => toLngLat(coordinate))
    .filter((coordinate): coordinate is LngLat => coordinate !== null);

  return {
    id: candidate.id,
    name: candidate.name,
    profile: candidate.profile,
    waypoints: parsedWaypoints,
    geometry: parsedGeometry,
    distanceMeters: candidate.distanceMeters,
    durationSeconds: candidate.durationSeconds,
    isRouted:
      typeof candidate.isRouted === "boolean"
        ? candidate.isRouted
        : parsedGeometry.length >= 2,
    updatedAt: candidate.updatedAt,
  };
};

const readStorage = (): PlannerStorage => {
  const fallbackRoute = createEmptyRoute(1);
  const fallbackState: PlannerStorage = {
    version: 1,
    apiKey: "",
    routes: [fallbackRoute],
    activeRouteId: fallbackRoute.id,
  };

  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw === null) {
    return fallbackState;
  }

  try {
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      apiKey?: unknown;
      routes?: unknown;
      activeRouteId?: unknown;
    };

    if (parsed.version !== 1 || !Array.isArray(parsed.routes)) {
      return fallbackState;
    }

    const routes = parsed.routes
      .map((entry) => parseRoute(entry))
      .filter((entry): entry is PlannedRoute => entry !== null);

    if (routes.length === 0) {
      return fallbackState;
    }

    const activeRouteId =
      typeof parsed.activeRouteId === "string" &&
      routes.some((route) => route.id === parsed.activeRouteId)
        ? parsed.activeRouteId
        : routes[0].id;

    return {
      version: 1,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      routes,
      activeRouteId,
    };
  } catch {
    return fallbackState;
  }
};

const writeStorage = (storage: PlannerStorage): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
};

const readStoredViewport = (): StoredViewport | null => {
  const raw = localStorage.getItem(VIEWPORT_STORAGE_KEY);

  if (raw === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      center?: unknown;
      zoom?: unknown;
      bearing?: unknown;
      pitch?: unknown;
    };

    if (
      !isLngLat(parsed.center) ||
      typeof parsed.zoom !== "number" ||
      !Number.isFinite(parsed.zoom) ||
      typeof parsed.bearing !== "number" ||
      !Number.isFinite(parsed.bearing) ||
      typeof parsed.pitch !== "number" ||
      !Number.isFinite(parsed.pitch)
    ) {
      return null;
    }

    return {
      center: parsed.center,
      zoom: parsed.zoom,
      bearing: parsed.bearing,
      pitch: parsed.pitch,
    };
  } catch {
    return null;
  }
};

const writeStoredViewport = (viewport: StoredViewport): void => {
  localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport));
};

const getRouteGeoJson = (
  route: PlannedRoute,
): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: LngLat[] };
    properties: Record<string, never>;
  }>;
} => {
  const coordinates =
    route.geometry.length >= 2
      ? route.geometry
      : route.waypoints.map((waypoint) => waypoint.coordinates);

  if (coordinates.length < 2) {
    return {
      type: "FeatureCollection",
      features: [],
    };
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates,
        },
        properties: {},
      },
    ],
  };
};

const readImportedRoutes = (value: unknown): PlannedRoute[] => {
  if (!value || typeof value !== "object") {
    return [];
  }

  const candidate = value as { routes?: unknown };

  if (!Array.isArray(candidate.routes)) {
    return [];
  }

  return candidate.routes
    .map((entry) => parseRoute(entry))
    .filter((entry): entry is PlannedRoute => entry !== null)
    .map((route) => ({
      ...route,
      id: createId(),
      name: route.name.trim() || "Imported Route",
      updatedAt: nowIso(),
    }));
};

const initMapPlanner = (): void => {
  const mapContainer = document.getElementById("planner-map");
  const statusEl = document.getElementById("planner-status");
  const routeNameInput = document.getElementById("planner-route-name");
  const profileInput = document.getElementById("planner-profile");
  const routeList = document.getElementById("planner-route-list");
  const apiKeyInput = document.getElementById("planner-api-key");
  const saveApiKeyButton = document.getElementById("planner-save-api-key");
  const searchInput = document.getElementById("planner-search-query");
  const searchButton = document.getElementById("planner-search-button");
  const useLocationButton = document.getElementById("planner-use-location");
  const addModeButton = document.getElementById("planner-add-mode");
  const undoWaypointButton = document.getElementById("planner-undo-waypoint");
  const clearRouteButton = document.getElementById("planner-clear-route");
  const newRouteButton = document.getElementById("planner-new-route");
  const saveRouteButton = document.getElementById("planner-save-route");
  const loadRouteButton = document.getElementById("planner-load-route");
  const deleteRouteButton = document.getElementById("planner-delete-route");
  const exportRoutesButton = document.getElementById("planner-export-routes");
  const importRoutesButton = document.getElementById("planner-import-routes");
  const importRoutesInput = document.getElementById("planner-import-file");
  const sendDistanceButton = document.getElementById("planner-send-distance");
  const routingIndicator = document.getElementById("planner-routing-indicator");
  const waypointCountOutput = document.getElementById("planner-waypoint-count");
  const routeDistanceOutput = document.getElementById("planner-distance");
  const routeDurationOutput = document.getElementById("planner-duration");

  if (
    !(mapContainer instanceof HTMLDivElement) ||
    !(statusEl instanceof HTMLElement) ||
    !(routeNameInput instanceof HTMLInputElement) ||
    !(profileInput instanceof HTMLSelectElement) ||
    !(routeList instanceof HTMLSelectElement) ||
    !(apiKeyInput instanceof HTMLInputElement) ||
    !(saveApiKeyButton instanceof HTMLButtonElement) ||
    !(searchInput instanceof HTMLInputElement) ||
    !(searchButton instanceof HTMLButtonElement) ||
    !(useLocationButton instanceof HTMLButtonElement) ||
    !(addModeButton instanceof HTMLButtonElement) ||
    !(undoWaypointButton instanceof HTMLButtonElement) ||
    !(clearRouteButton instanceof HTMLButtonElement) ||
    !(newRouteButton instanceof HTMLButtonElement) ||
    !(saveRouteButton instanceof HTMLButtonElement) ||
    !(loadRouteButton instanceof HTMLButtonElement) ||
    !(deleteRouteButton instanceof HTMLButtonElement) ||
    !(exportRoutesButton instanceof HTMLButtonElement) ||
    !(importRoutesButton instanceof HTMLButtonElement) ||
    !(importRoutesInput instanceof HTMLInputElement) ||
    !(sendDistanceButton instanceof HTMLButtonElement) ||
    !(routingIndicator instanceof HTMLElement) ||
    !(waypointCountOutput instanceof HTMLElement) ||
    !(routeDistanceOutput instanceof HTMLElement) ||
    !(routeDurationOutput instanceof HTMLElement)
  ) {
    return;
  }

  const maplibregl = (window as Window & { maplibregl?: any }).maplibregl;

  if (!maplibregl) {
    statusEl.textContent = "Map library failed to load.";
    return;
  }

  const setStatus = (message: string): void => {
    statusEl.textContent = message;
  };

  const setRoutingState = (isLoading: boolean): void => {
    routingIndicator.hidden = !isLoading;
    sendDistanceButton.disabled = isLoading;
  };

  const storage = readStorage();
  const initialViewport = readStoredViewport();
  let addMode = true;
  let waypointMarkers: any[] = [];
  let userLocationMarker: any | null = null;
  let geolocationRequestInFlight = false;
  let mapLoaded = false;
  let requestCounter = 0;
  let selectedRouteId = storage.activeRouteId;

  const map = new maplibregl.Map({
    container: mapContainer,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
        },
      ],
    },
    center: initialViewport?.center ?? DEFAULT_CENTER,
    zoom: initialViewport?.zoom ?? DEFAULT_ZOOM,
    bearing: initialViewport?.bearing ?? 0,
    pitch: initialViewport?.pitch ?? 0,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  const getActiveRoute = (): PlannedRoute => {
    const activeRoute = storage.routes.find(
      (route) => route.id === storage.activeRouteId,
    );

    if (activeRoute) {
      return activeRoute;
    }

    const fallback = storage.routes[0] ?? createEmptyRoute(1);

    if (storage.routes.length === 0) {
      storage.routes.push(fallback);
    }

    storage.activeRouteId = fallback.id;
    return fallback;
  };

  const persist = (): void => {
    writeStorage(storage);
  };

  const persistViewport = (): void => {
    const center = map.getCenter();

    writeStoredViewport({
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    });
  };

  const refreshSummary = (): void => {
    const activeRoute = getActiveRoute();
    waypointCountOutput.textContent = String(activeRoute.waypoints.length);
    routeDistanceOutput.textContent = formatDistance(
      activeRoute.distanceMeters,
    );
    routeDurationOutput.textContent = activeRoute.isRouted
      ? formatDuration(activeRoute.durationSeconds)
      : "Pending route";
  };

  const refreshRouteList = (): void => {
    const activeRoute = getActiveRoute();
    routeList.innerHTML = "";

    storage.routes.forEach((route) => {
      const option = document.createElement("option");
      option.value = route.id;
      option.textContent = `${route.name} (${formatDistance(route.distanceMeters)})`;
      option.selected = route.id === (selectedRouteId ?? activeRoute.id);
      routeList.append(option);
    });
  };

  const refreshRouteLine = (): void => {
    if (!mapLoaded) {
      return;
    }

    const source = map.getSource(ROUTE_SOURCE_ID);

    if (!source) {
      return;
    }

    source.setData(getRouteGeoJson(getActiveRoute()));
  };

  const clearMarkers = (): void => {
    waypointMarkers.forEach((marker) => marker.remove());
    waypointMarkers = [];
  };

  const refreshMarkers = (): void => {
    if (!mapLoaded) {
      return;
    }

    clearMarkers();

    const activeRoute = getActiveRoute();

    activeRoute.waypoints.forEach((waypoint, index) => {
      const markerEl = document.createElement("button");
      markerEl.type = "button";
      markerEl.className = "waypoint-marker";
      markerEl.textContent = String(index + 1);
      markerEl.title = "Right-click to remove this waypoint";

      const marker = new maplibregl.Marker({
        element: markerEl,
        draggable: true,
      })
        .setLngLat(waypoint.coordinates)
        .addTo(map);

      marker.on("dragend", () => {
        const lngLat = marker.getLngLat();
        waypoint.coordinates = [lngLat.lng, lngLat.lat];
        activeRoute.updatedAt = nowIso();
        persist();
        void recomputeRoute();
      });

      markerEl.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        activeRoute.waypoints = activeRoute.waypoints.filter(
          (candidate) => candidate.id !== waypoint.id,
        );
        activeRoute.updatedAt = nowIso();
        persist();
        refreshMarkers();
        void recomputeRoute();
      });

      waypointMarkers.push(marker);
    });
  };

  const redraw = (): void => {
    const activeRoute = getActiveRoute();
    selectedRouteId = storage.routes.some(
      (route) => route.id === selectedRouteId,
    )
      ? selectedRouteId
      : activeRoute.id;
    routeNameInput.value = activeRoute.name;
    profileInput.value = activeRoute.profile;
    refreshRouteList();
    refreshSummary();
    refreshRouteLine();
    refreshMarkers();
  };

  const getApiKey = (): string => {
    const fromInput = apiKeyInput.value.trim();
    return fromInput.length > 0 ? fromInput : storage.apiKey.trim();
  };

  const saveApiKey = (): void => {
    storage.apiKey = apiKeyInput.value.trim();
    persist();
  };

  const getGeolocationErrorMessage = (
    error: GeolocationPositionError,
  ): string => {
    if (error.code === error.PERMISSION_DENIED) {
      return "Location permission denied. Allow location access in browser settings.";
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
      return "Location unavailable. Try again in an area with better GPS/network signal.";
    }

    if (error.code === error.TIMEOUT) {
      return "Location request timed out. Try again.";
    }

    return "Unable to read your location.";
  };

  const recomputeRoute = async (): Promise<void> => {
    const activeRoute = getActiveRoute();
    const waypointCoordinates = activeRoute.waypoints.map(
      (waypoint) => waypoint.coordinates,
    );
    const requestId = ++requestCounter;

    activeRoute.updatedAt = nowIso();
    activeRoute.profile = profileInput.value as PlannerProfile;

    if (activeRoute.waypoints.length < 2) {
      setRoutingState(false);
      activeRoute.geometry = [];
      activeRoute.distanceMeters = 0;
      activeRoute.durationSeconds = 0;
      activeRoute.isRouted = false;
      persist();
      refreshSummary();
      refreshRouteLine();
      refreshRouteList();
      return;
    }

    activeRoute.geometry = [];
    activeRoute.distanceMeters = calculatePathDistance(waypointCoordinates);
    activeRoute.durationSeconds = 0;
    activeRoute.isRouted = false;
    persist();
    refreshSummary();
    refreshRouteLine();
    refreshRouteList();

    const apiKey = getApiKey();

    if (apiKey.length === 0) {
      setRoutingState(false);
      setStatus(
        "Add an openrouteservice API key to replace the provisional line with a road/trail route.",
      );
      return;
    }

    setRoutingState(true);
    setStatus("Calculating route...");

    try {
      const response = await fetch(
        `https://api.openrouteservice.org/v2/directions/${activeRoute.profile}/geojson`,
        {
          method: "POST",
          headers: {
            Authorization: apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            coordinates: waypointCoordinates,
            instructions: false,
            elevation: false,
          }),
        },
      );

      if (requestId !== requestCounter) {
        return;
      }

      if (!response.ok) {
        setRoutingState(false);
        setStatus(`Route request failed (${response.status}).`);
        return;
      }

      const payload = (await response.json()) as {
        features?: Array<{
          geometry?: { type?: string; coordinates?: unknown };
          properties?: { summary?: { distance?: number; duration?: number } };
        }>;
      };
      const feature = payload.features?.[0];
      const coordinates =
        feature?.geometry?.type === "LineString" &&
        Array.isArray(feature.geometry.coordinates)
          ? feature.geometry.coordinates
              .map((coordinate) => toLngLat(coordinate))
              .filter((coordinate): coordinate is LngLat => coordinate !== null)
          : [];

      activeRoute.geometry = coordinates;
      activeRoute.distanceMeters = Number.isFinite(
        feature?.properties?.summary?.distance,
      )
        ? (feature?.properties?.summary?.distance ?? 0)
        : 0;
      activeRoute.durationSeconds = Number.isFinite(
        feature?.properties?.summary?.duration,
      )
        ? (feature?.properties?.summary?.duration ?? 0)
        : 0;
      activeRoute.isRouted = coordinates.length >= 2;
      activeRoute.updatedAt = nowIso();
      persist();
      refreshSummary();
      refreshRouteLine();
      refreshRouteList();
      setRoutingState(false);
      setStatus(
        activeRoute.isRouted ? "Route updated." : "Route geometry unavailable.",
      );
    } catch {
      if (requestId !== requestCounter) {
        return;
      }

      setRoutingState(false);
      setStatus("Unable to reach routing service. Showing provisional line.");
    }
  };

  const requestLocation = (): void => {
    if (!window.isSecureContext) {
      setStatus("Location requires HTTPS or localhost.");
      return;
    }

    if (!navigator.geolocation) {
      setStatus("Geolocation is unavailable in this browser.");
      return;
    }

    if (geolocationRequestInFlight) {
      return;
    }

    geolocationRequestInFlight = true;
    useLocationButton.disabled = true;
    useLocationButton.textContent = "Locating...";
    setStatus("Requesting your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const center: LngLat = [
          position.coords.longitude,
          position.coords.latitude,
        ];

        if (userLocationMarker !== null) {
          userLocationMarker.remove();
        }

        userLocationMarker = new maplibregl.Marker({ color: "#16a34a" })
          .setLngLat(center)
          .addTo(map);

        map.flyTo({
          center,
          zoom: 14,
          essential: true,
        });

        const accuracy = Math.round(position.coords.accuracy);
        setStatus(`Map centered on your location (accuracy ~${accuracy} m).`);
        geolocationRequestInFlight = false;
        useLocationButton.disabled = false;
        useLocationButton.textContent = "Use My Location";
      },
      (error) => {
        setStatus(getGeolocationErrorMessage(error));
        geolocationRequestInFlight = false;
        useLocationButton.disabled = false;
        useLocationButton.textContent = "Use My Location";
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  };

  const searchPlace = async (): Promise<void> => {
    const query = searchInput.value.trim();

    if (query.length === 0) {
      setStatus("Enter a place name to search.");
      return;
    }

    const apiKey = getApiKey();

    if (apiKey.length === 0) {
      setStatus("Add an openrouteservice API key to use place search.");
      return;
    }

    setStatus("Searching place...");

    try {
      const url = new URL("https://api.openrouteservice.org/geocode/search");
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("text", query);
      url.searchParams.set("size", "1");

      const response = await fetch(url.toString());

      if (!response.ok) {
        setStatus(`Place search failed (${response.status}).`);
        return;
      }

      const payload = (await response.json()) as {
        features?: Array<{ geometry?: { coordinates?: unknown } }>;
      };
      const firstResult = payload.features?.[0];
      const coordinates = firstResult?.geometry?.coordinates;

      if (!isLngLat(coordinates)) {
        setStatus("No place found for that query.");
        return;
      }

      map.flyTo({
        center: coordinates,
        zoom: 14,
        essential: true,
      });
      setStatus("Map focused on the search result.");
    } catch {
      setStatus("Unable to complete place search.");
    }
  };

  const exportRoutes = (): void => {
    const payload = {
      version: 1,
      exportedAt: nowIso(),
      routes: storage.routes,
      activeRouteId: storage.activeRouteId,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `f2-routes-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    setStatus("Routes exported.");
  };

  const loadImportedRoutes = async (file: File): Promise<void> => {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    const importedRoutes = readImportedRoutes(parsed);

    if (importedRoutes.length === 0) {
      setStatus("No valid routes were found in that JSON file.");
      return;
    }

    storage.routes.push(...importedRoutes);
    storage.activeRouteId = importedRoutes[0].id;
    persist();
    redraw();
    setStatus(`Imported ${importedRoutes.length} route(s).`);
  };

  const undoLastWaypoint = (): void => {
    const activeRoute = getActiveRoute();

    if (activeRoute.waypoints.length === 0) {
      setStatus("No waypoint to undo.");
      return;
    }

    activeRoute.waypoints.pop();
    activeRoute.updatedAt = nowIso();
    persist();
    refreshMarkers();
    void recomputeRoute();
  };

  const loadSelectedRoute = (): void => {
    if (
      !selectedRouteId ||
      !storage.routes.some((route) => route.id === selectedRouteId)
    ) {
      setStatus("Select a saved route to load.");
      return;
    }

    storage.activeRouteId = selectedRouteId;
    persist();
    redraw();
    setStatus("Loaded selected route.");
  };

  addModeButton.setAttribute("aria-pressed", "true");
  addModeButton.textContent = "Add Points: On";

  map.on("load", () => {
    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });

    map.addLayer({
      id: ROUTE_CASING_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#ffffff",
        "line-width": 8,
      },
    });

    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#0a84ff",
        "line-width": 5,
      },
    });

    mapLoaded = true;
    redraw();
  });

  map.on("moveend", () => {
    persistViewport();
  });

  map.on("click", (event: { lngLat: { lng: number; lat: number } }) => {
    if (!addMode) {
      return;
    }

    const activeRoute = getActiveRoute();
    activeRoute.waypoints.push({
      id: createId(),
      coordinates: [event.lngLat.lng, event.lngLat.lat],
    });
    activeRoute.updatedAt = nowIso();
    persist();
    refreshMarkers();
    void recomputeRoute();
  });

  saveApiKeyButton.addEventListener("click", () => {
    saveApiKey();
    setStatus("API key saved in browser storage.");
  });

  apiKeyInput.addEventListener("change", () => {
    saveApiKey();
  });

  searchButton.addEventListener("click", () => {
    void searchPlace();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void searchPlace();
    }
  });

  useLocationButton.addEventListener("click", () => {
    requestLocation();
  });

  addModeButton.addEventListener("click", () => {
    addMode = !addMode;
    addModeButton.setAttribute("aria-pressed", addMode ? "true" : "false");
    addModeButton.textContent = addMode ? "Add Points: On" : "Add Points: Off";
    setStatus(
      addMode
        ? "Click map to add waypoints."
        : "Add mode paused so you can pan/zoom freely.",
    );
  });

  undoWaypointButton.addEventListener("click", () => {
    undoLastWaypoint();
  });

  clearRouteButton.addEventListener("click", () => {
    const activeRoute = getActiveRoute();
    activeRoute.waypoints = [];
    activeRoute.geometry = [];
    activeRoute.distanceMeters = 0;
    activeRoute.durationSeconds = 0;
    activeRoute.isRouted = false;
    activeRoute.updatedAt = nowIso();
    persist();
    redraw();
    setStatus("Active route cleared.");
  });

  newRouteButton.addEventListener("click", () => {
    const route = createEmptyRoute(storage.routes.length + 1);
    route.profile = profileInput.value as PlannerProfile;
    storage.routes.push(route);
    storage.activeRouteId = route.id;
    selectedRouteId = route.id;
    persist();
    redraw();
    setStatus("New route created.");
  });

  saveRouteButton.addEventListener("click", () => {
    const activeRoute = getActiveRoute();
    const trimmedName = routeNameInput.value.trim();
    activeRoute.name = trimmedName.length > 0 ? trimmedName : activeRoute.name;
    activeRoute.profile = profileInput.value as PlannerProfile;
    activeRoute.updatedAt = nowIso();
    saveApiKey();
    persist();
    refreshRouteList();
    setStatus("Route saved.");
  });

  loadRouteButton.addEventListener("click", () => {
    loadSelectedRoute();
  });

  deleteRouteButton.addEventListener("click", () => {
    if (storage.routes.length <= 1) {
      setStatus("At least one route must remain.");
      return;
    }

    if (!selectedRouteId) {
      setStatus("Select a saved route to delete.");
      return;
    }

    const routeToDelete = storage.routes.find(
      (route) => route.id === selectedRouteId,
    );

    if (!routeToDelete) {
      setStatus("Selected route no longer exists.");
      return;
    }

    storage.routes = storage.routes.filter(
      (route) => route.id !== routeToDelete.id,
    );

    if (storage.activeRouteId === routeToDelete.id) {
      storage.activeRouteId = storage.routes[0]?.id ?? null;
    }

    selectedRouteId = storage.activeRouteId ?? storage.routes[0]?.id ?? null;
    persist();
    redraw();
    setStatus("Route deleted.");
  });

  routeList.addEventListener("change", () => {
    selectedRouteId = routeList.value;
    setStatus("Saved route selected. Use Load Selected Route to switch.");
  });

  profileInput.addEventListener("change", () => {
    const activeRoute = getActiveRoute();
    activeRoute.profile = profileInput.value as PlannerProfile;
    activeRoute.updatedAt = nowIso();
    persist();
    void recomputeRoute();
  });

  routeNameInput.addEventListener("input", () => {
    const activeRoute = getActiveRoute();
    const trimmedName = routeNameInput.value.trim();
    if (trimmedName.length === 0) {
      return;
    }

    activeRoute.name = trimmedName;
    activeRoute.updatedAt = nowIso();
    persist();
    refreshRouteList();
  });

  exportRoutesButton.addEventListener("click", () => {
    exportRoutes();
  });

  importRoutesButton.addEventListener("click", () => {
    importRoutesInput.click();
  });

  importRoutesInput.addEventListener("change", () => {
    const file = importRoutesInput.files?.[0];

    if (!file) {
      return;
    }

    void loadImportedRoutes(file)
      .catch(() => {
        setStatus("Unable to import that JSON file.");
      })
      .finally(() => {
        importRoutesInput.value = "";
      });
  });

  window.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    const isTypingTarget =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable === true;

    if (isTypingTarget) {
      return;
    }

    if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoLastWaypoint();
    }
  });

  sendDistanceButton.addEventListener("click", () => {
    const activeRoute = getActiveRoute();

    if (activeRoute.distanceMeters <= 0) {
      setStatus("Calculate a route before sending distance to the calculator.");
      return;
    }

    publishRouteDistance(activeRoute.distanceMeters);
    setStatus("Distance sent to calculator.");

    document.getElementById("pace-calculator")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });

  apiKeyInput.value = storage.apiKey;
  redraw();
  setStatus(
    initialViewport
      ? "Restored your last viewed map area."
      : "Click Use My Location or search for a place to begin.",
  );
};

initMapPlanner();
