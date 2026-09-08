// Analysis worker skeleton — SCAFFOLD §1, ADR §2.
// The worker is the ONLY writer of analysis_* tables. pg-boss job consumption, grounding
// validation, and the SSE progress chain arrive at D-17 (P3). Nothing runs at P0.
export function main(): void {
  console.log('analysis-worker: skeleton — job consumption arrives at D-17 (P3)');
}
