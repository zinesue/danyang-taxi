import type {
  FareConfig,
  Graph,
  WorkerRequest,
  WorkerResponse,
} from "../types";
import { loadJson } from "../lib/data";
import { Router } from "../lib/routing";
import { analyzePlan } from "../lib/planner";

let router: Router | null = null;
let config: FareConfig;
const respond = (value: WorkerResponse) => self.postMessage(value);
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "init") {
      router = new Router(await loadJson<Graph>(request.url));
      config = request.fare;
      respond({ id: request.id, type: "ready" });
    } else {
      if (!router) throw new Error("도로 데이터를 준비 중입니다.");
      respond({
        id: request.id,
        type: "result",
        analysis: analyzePlan(router, request.plan, request.candidate, config),
      });
    }
  } catch (error) {
    respond({
      id: request.id,
      type: "error",
      message:
        error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.",
    });
  }
};
