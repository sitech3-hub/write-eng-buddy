import { createServerFn } from "@tanstack/react-start";
import { getModelStatusSnapshot } from "./ai-gateway";

export const getModelStatus = createServerFn({ method: "GET" }).handler(async () => {
  return getModelStatusSnapshot();
});
