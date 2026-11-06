/* ------------------------------------------------------------------ */
/*  routes/similar-patients.ts – dynamic cosine similarity            */
/* ------------------------------------------------------------------ */
/** ============================================================================
 * Similar Patients API — feature hashing + cosine similarity
 * =============================================================================
 * MODEL
 *  - Feature vector: [age/100, par/50, one-hot(condition_hash∈{0..3})].
 *  - Similarity: cosine(a,b) ∈ [0,1]; exposed as percentage with 2 decimals.
 *  - This is a pedagogical baseline (fast, explainable); replace with a
 *    clinically validated embedding in production (e.g., learned vectors).
 * FILTERS
 *  - k: top-k neighbors
 *  - minSimilarity: threshold pruning
 * SEARCH
 *  - POST /search supports cohort gating by age/PAR/outcome prior to ranking.
 * ============================================================================ */
import { Router, Request, Response } from "express";
import { patients }                  from "./patients";

/* ───── basic vector math ─────────────────────────────────────────── */
const dot   = (a:number[], b:number[]) => a.reduce((s,_,i)=>s+a[i]*b[i], 0);
const norm  = (a:number[])            =>
                Math.sqrt(a.reduce((s,x)=>s+x*x, 0));
const cosine= (a:number[], b:number[])=>{
  const n = norm(a)*norm(b); return n===0 ? 0 : dot(a,b)/n;
};

/* ───── feature extraction ───────────────────────────────────────── */
/** Deterministic featurization with bounded scalars and 4-way hash of condition. */
function toVec(p:any) {
  /* Age and PAR mapped to 0-1  plus a 4-bucket one-hot hash
     of the condition string.                                     */
  const age  = (p.age      ?? 0) / 100;
  const par  = (p.parScore ?? 0) / 50;

  const h    = Math.abs([... (p.condition ?? "") ]
               .reduce((s,c)=>s+c.charCodeAt(0),0)) % 4;
  const oh   = [0,0,0,0]; oh[h] = 1;

  return [age, par, ...oh];   // length = 6
}

/* ───── transform to API shape ───────────────────────────────────── */
/** Lift similarity scalar into the public SimilarPatient projection. */
function makeSimilar(base:any, other:any) {
  const sim = cosine(toVec(base), toVec(other));
  return {
    id        : other.id,
    name      : other.name,
    age       : other.age,
    condition : other.condition,
    similarity: Math.round(sim * 10000) / 100,   // e.g. 87.53
    outcome   : (other as any).outcome  ?? "unknown",
    treatment : (other as any).treatment ?? "",
  };
}

/* ================================================================== */
export const router = Router();

/** GET /:patientId — top-k neighbors with optional similarity floor. */
router.get("/:patientId", (req:Request, res:Response) => {
  const { patientId } = req.params;
  const k             = Number(req.query.k ?? 10);
  const threshold     = Number(req.query.minSimilarity ?? 0);

  const base = patients.find(p => p.id === patientId);
  if (!base)
    return res.status(404).json({ success:false, error:"Patient not found" });

  const list = patients
    .filter(p => p.id !== patientId)
    .map (p => makeSimilar(base, p))
    .filter(p => p.similarity >= threshold)
    .sort ((a,b) => b.similarity - a.similarity)
    .slice(0, k);

  res.json({ success:true, data:list, count:list.length });
});

/** POST /:patientId/search — cohort-gated neighbor search with ranking. */
router.post("/:patientId/search", (req:Request, res:Response) => {
  const { patientId }   = req.params;
  const {
    ageRange      = { min:0,  max:120 },
    parScoreRange = { min:0,  max:50  },
    outcomes      = [] as string[],
    minSimilarity = 0,
  } = req.body ?? {};

  const base = patients.find(p => p.id === patientId);
  if (!base)
    return res.status(404).json({ success:false, error:"Patient not found" });

  const list = patients
    .filter(p =>
      p.id !== patientId &&
      p.age       >= ageRange.min     && p.age       <= ageRange.max &&
      p.parScore  >= parScoreRange.min&& p.parScore  <= parScoreRange.max
    )
    .map(p => makeSimilar(base, p))
    .filter(p => p.similarity >= minSimilarity)
    .filter(p => outcomes.length === 0 || outcomes.includes(p.outcome))
    .sort  ((a,b) => b.similarity - a.similarity);

  res.json({ success:true, data:list, count:list.length });
});
