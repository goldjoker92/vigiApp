import { decideSinalizar } from "../utils/sinalizarDecision";

describe("decideSinalizar", () => {
  it("retourne PUBLIC si pas de groupe", () => {
    expect(decideSinalizar({ hasGroup: false, inSameZone: false })).toBe("PUBLIC");
  });

  it("retourne PRIVATE_OR_PUBLIC si groupe et même zone", () => {
    expect(decideSinalizar({ hasGroup: true, inSameZone: true })).toBe("PRIVATE_OR_PUBLIC");
  });

  it("retourne PUBLIC si groupe mais hors zone", () => {
    expect(decideSinalizar({ hasGroup: true, inSameZone: false })).toBe("PUBLIC");
  });
});
