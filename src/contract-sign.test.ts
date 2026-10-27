import assert from "node:assert/strict";
import { migrationDecision } from "./contract-sign.ts";

assert.equal(migrationDecision({ signatureVerified: true, downloadWorks: true }), "cutover");
assert.equal(migrationDecision({ signatureVerified: true, downloadWorks: false }), "rollback");
console.log("migration decision test passed");
