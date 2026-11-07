import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapInstance,
} from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import { Expand, LocateFixed, X } from "lucide-react";
import type { Analysis, Metadata, Place, Plan } from "../types";
import { loadJson } from "../lib/data";
import { AddressSearch } from "./AddressSearch";
import "maplibre-gl/dist/maplibre-gl.css";

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
type Props = {
  metadata: Metadata;
  plan: Plan;
  analysis: Analysis | null;
  places: Place[];
  onSelect: (place: Place) => void;
  busy: boolean;
  fresh: boolean;
};
export function MapView({
  metadata,
  plan,
  analysis,
  places,
  onSelect,
  busy,
  fresh,
}: Props) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<MapInstance | null>(null);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const [loaded, setLoaded] = useState(false),
    [mapError, setMapError] = useState("");
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!element.current) return;
    let cancelled = false;
    let instance: MapInstance;
    try {
      instance = new maplibregl.Map({
        container: element.current,
        center: [metadata.defaultStart.lng, metadata.defaultStart.lat],
        zoom: 12.4,
        minZoom: 8,
        maxZoom: 18,
        attributionControl: { compact: false },
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              maxzoom: 19,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
            },
          },
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#eef2eb" },
            },
            {
              id: "osm",
              type: "raster",
              source: "osm",
              paint: { "raster-opacity": 0.75, "raster-saturation": -0.65 },
            },
          ],
        },
      });
    } catch {
      setMapError("지도를 실행하려면 WebGL을 지원하는 브라우저가 필요합니다.");
      return;
    }
    map.current = instance;
    instance.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    instance.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-left",
    );
    instance.on("click", (event) =>
      callback.current({
        name: "",
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
      }),
    );
    instance.on("error", (event) => {
      if ("sourceId" in event && event.sourceId === "osm")
        setMapError(
          "배경지도를 불러오지 못했습니다. 도로 분석은 계속 이용할 수 있습니다.",
        );
    });
    instance.on("load", () => {
      const base = `${import.meta.env.BASE_URL}data/`;
      instance.addSource("boundary", {
        type: "geojson",
        data: base + "danyang-boundary.geojson",
      });
      instance.addLayer({
        id: "boundary-fill",
        type: "fill",
        source: "boundary",
        paint: { "fill-color": "#82967c", "fill-opacity": 0.035 },
      });
      instance.addLayer({
        id: "boundary",
        type: "line",
        source: "boundary",
        paint: {
          "line-color": "#737e6c",
          "line-width": 1.8,
          "line-dasharray": [4, 3],
          "line-opacity": 0.75,
        },
      });
      for (const id of [
        "roads",
        "reachable",
        "confirmed",
        "homeward",
        "candidate",
        "connector",
      ])
        instance.addSource(id, { type: "geojson", data: empty });
      instance.addLayer({
        id: "roads",
        type: "line",
        source: "roads",
        paint: {
          "line-color": "#89958d",
          "line-opacity": 0.35,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.7, 15, 2],
        },
      });
      instance.addLayer({
        id: "reachable-glow",
        type: "line",
        source: "reachable",
        paint: {
          "line-color": "#42bf7b",
          "line-opacity": 0.2,
          "line-width": 10,
        },
      });
      instance.addLayer({
        id: "reachable",
        type: "line",
        source: "reachable",
        paint: {
          "line-color": "#2caa6c",
          "line-opacity": 0.72,
          "line-width": 3.5,
        },
      });
      instance.addLayer({
        id: "confirmed-white",
        type: "line",
        source: "confirmed",
        paint: { "line-color": "#fff", "line-width": 8 },
      });
      instance.addLayer({
        id: "confirmed",
        type: "line",
        source: "confirmed",
        paint: { "line-color": "#204d88", "line-width": 5 },
      });
      instance.addLayer({
        id: "homeward",
        type: "line",
        source: "homeward",
        paint: {
          "line-color": "#7564b4",
          "line-width": 4,
          "line-dasharray": [2, 2],
        },
      });
      instance.addLayer({
        id: "candidate",
        type: "line",
        source: "candidate",
        paint: {
          "line-color": "#e77536",
          "line-width": 5,
          "line-dasharray": [2, 1.5],
        },
      });
      instance.addLayer({
        id: "connector",
        type: "line",
        source: "connector",
        paint: {
          "line-color": "#5e625f",
          "line-width": 2,
          "line-dasharray": [1, 2],
        },
      });
      setLoaded(true);
      loadJson<FeatureCollection>(base + "road-display.geojson.gz")
        .then((data) => {
          if (!cancelled)
            (instance.getSource("roads") as GeoJSONSource).setData(data);
        })
        .catch(() => {
          if (!cancelled)
            setMapError(
              "기본 도로 표시를 불러오지 못했습니다. 새로고침해 주세요.",
            );
        });
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current);
    return () => {
      cancelled = true;
      observer.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      instance.remove();
      map.current = null;
    };
  }, [metadata]);

  useEffect(() => {
    const instance = map.current;
    if (!loaded || !instance) return;
    const routes = (coordinates: number[][][]): FeatureCollection => ({
      type: "FeatureCollection",
      features: coordinates
        .filter((c) => c.length >= 2)
        .map((c) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: c },
        })),
    });
    const set = (id: string, data: FeatureCollection<Geometry>) =>
      (instance.getSource(id) as GeoJSONSource).setData(data);
    set("reachable", fresh && analysis ? analysis.reachable : empty);
    set(
      "confirmed",
      routes(analysis?.confirmed.map((r) => r.coordinates) ?? []),
    );
    set(
      "candidate",
      routes(
        fresh && analysis?.candidate?.outward
          ? [analysis.candidate.outward.coordinates]
          : [],
      ),
    );
    set(
      "homeward",
      routes(
        fresh && analysis?.candidate?.homeward
          ? [analysis.candidate.homeward.coordinates]
          : [],
      ),
    );
    set(
      "connector",
      routes(
        fresh &&
          analysis?.candidate?.snap &&
          analysis.candidate.snap.distanceToRoad > 10
          ? [
              [
                analysis.candidate.snap.requested,
                [analysis.candidate.snap.lng, analysis.candidate.snap.lat],
              ],
            ]
          : [],
      ),
    );
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const marker = (place: Place, text: string, cls: string, title: string) => {
      const el = document.createElement("button");
      el.className = `map-marker ${cls}`;
      el.textContent = text;
      el.title = title;
      el.setAttribute("aria-label", title);
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        callback.current(place);
      });
      markers.current.push(
        new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([place.lng, place.lat])
          .addTo(instance),
      );
    };
    marker(
      analysis?.start ?? plan.start,
      "출",
      "start",
      `출발지: ${plan.start.name}`,
    );
    (analysis?.visits ?? plan.visits).forEach((place, i) =>
      marker(
        place,
        String(i + 1),
        i === plan.visits.length - 1 && !plan.finished ? "current" : "visit",
        `${i + 1}번 방문지: ${place.name}`,
      ),
    );
    if (!plan.sameEnd)
      marker(
        analysis?.end ?? plan.end,
        "끝",
        "end",
        `최종 도착지: ${plan.end.name}`,
      );
    if (fresh && analysis?.candidate) {
      const p = analysis.candidate.snap ?? analysis.candidate.requested;
      marker(p, "?", "candidate", `후보지: ${p.name || "선택한 위치"}`);
      const coordinates = [
        ...(analysis.candidate.outward?.coordinates ?? []),
        ...(analysis.candidate.homeward?.coordinates ?? []),
      ];
      if (coordinates.length > 1) {
        const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0]);
        for (const coordinate of coordinates) bounds.extend(coordinate);
        instance.fitBounds(bounds, {
          padding: { top: 65, bottom: 40, left: 35, right: 55 },
          maxZoom: 14,
          duration: 400,
        });
      }
    }
  }, [loaded, analysis, plan, fresh]);

  return (
    <section className="map-panel" aria-label="단양군 여행 지도">
      <div ref={element} className="map-canvas" />
      <div className="map-topbar">
        <AddressSearch places={places} graphVersion={metadata.version} onSelect={place => {
          map.current?.flyTo({ center: [place.lng, place.lat], zoom: 15 });
          callback.current(place);
        }} />
      </div>
      <div className="map-tools">
        <button
          title="단양군 전체 보기"
          aria-label="단양군 전체 보기"
          onClick={() =>
            map.current?.fitBounds(
              [
                [metadata.bounds[0], metadata.bounds[1]],
                [metadata.bounds[2], metadata.bounds[3]],
              ],
              { padding: 55 },
            )
          }
        >
          <Expand size={19} />
        </button>
        <button
          title="현재 위치 보기"
          aria-label="현재 계획 위치 보기"
          onClick={() =>
            map.current?.flyTo({
              center: [
                analysis?.current.lng ?? plan.start.lng,
                analysis?.current.lat ?? plan.start.lat,
              ],
              zoom: 13.5,
            })
          }
        >
          <LocateFixed size={20} />
        </button>
      </div>
      <div className="map-legend">
        {!plan.finished && <span><i className="legend-line green" />이동 가능</span>}
        {!!plan.visits.length && <span><i className="legend-line blue" />확정</span>}
        {fresh && analysis?.candidate && <><span><i className="legend-line orange" />방문</span><span><i className="legend-line purple" />복귀</span></>}
      </div>
      {busy && (
        <div className="map-status" role="status">
          <span className="spinner" />
          도로망을 분석하고 있어요
        </div>
      )}
      {mapError && (
        <div className="map-error" role="alert">
          {mapError}
          <button aria-label="지도 안내 닫기" onClick={() => setMapError("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </section>
  );
}
