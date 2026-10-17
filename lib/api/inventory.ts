import type {
  CorrectStockRequest,
  InventoryDetailDto,
  InventoryLocationDto,
  ReceiveStockRequest,
  StockCorrectionDto,
  StockMovementDto,
  TransferStockRequest,
  VerifyUnitRequest,
} from "@/lib/contracts/inventory";
import { getJson, sendJson } from "./client";

export const inventoryApi = {
  list: (signal?: AbortSignal) => getJson<InventoryLocationDto[]>("/api/inventory", { signal }),
  detail: (locationId: string, productId: string, signal?: AbortSignal) =>
    getJson<InventoryDetailDto>(`/api/inventory/${encodeURIComponent(locationId)}/${encodeURIComponent(productId)}`, { signal }),
  receive: (input: ReceiveStockRequest) => sendJson<StockMovementDto>("POST", "/api/inventory", input),
  correct: (input: CorrectStockRequest) => sendJson<StockCorrectionDto>("POST", "/api/stock/corrections", input),
  verify: (input: VerifyUnitRequest) => sendJson("POST", "/api/units/verify", input),
  transfer: (input: TransferStockRequest) => sendJson<StockMovementDto>("POST", "/api/stock/transfers", input),
};
