import { afterEach, expect, it, vi } from "vitest";
import handler from "../../api/growth-plan";
afterEach(() => vi.unstubAllGlobals());
const body = { submission_id: "11111111-1111-4111-8111-111111111111", first_name: "Test", email: "test@example.com", marketing_consent: true, forecast_snapshot: { baseline: {}, assumptions: {} }, test_record: true };
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }; }
it("captures once server-side and acknowledges acceptance", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
  const res = response(); await handler({ method: "POST", headers: { "content-type": "application/json" }, body }, res);
  expect(res.status).toHaveBeenCalledWith(202);
  const event = JSON.parse(fetch.mock.calls[0][1].body);
  expect(event.event).toBe("growth_plan_requested"); expect(event.uuid).toBe(body.submission_id);
  expect(event.properties.test_record).toBe(true); expect(JSON.parse(event.properties.forecast_json)).toEqual(body.forecast_snapshot);
});
it("rejects invalid requests without sending", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); const res = response();
  await handler({ method: "POST", headers: { "content-type": "application/json" }, body: { ...body, marketing_consent: false } }, res);
  expect(res.status).toHaveBeenCalledWith(400); expect(fetch).not.toHaveBeenCalled();
});
it("does not acknowledge upstream failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false })); const res = response();
  await handler({ method: "POST", headers: { "content-type": "application/json" }, body }, res);
  expect(res.status).toHaveBeenCalledWith(502);
});
