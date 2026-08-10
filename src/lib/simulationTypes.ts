export type Likelihood = "low" | "medium" | "high";
export type Difficulty = "trivial" | "moderate" | "advanced";
export type ImpactLevel = "low" | "medium" | "high" | "critical";

export interface AttackStepNode {
  name: string;
  description: string;
  risk: ImpactLevel;
}

export interface BusinessImpactBreakdown {
  financialLoss: ImpactLevel;
  operationalDowntime: ImpactLevel;
  customerImpact: ImpactLevel;
  complianceRisk: ImpactLevel;
  reputationDamage: ImpactLevel;
}

interface SimulationCore {
  /** First-person, "if I were an attacker..." framing per Feature 4. */
  summary: string;
  steps: AttackStepNode[];
  likelihood: Likelihood;
  difficulty: Difficulty;
  timeToExploit: string;
  businessImpact: string;
  businessImpactBreakdown: BusinessImpactBreakdown;
  recommendations: string[];
  /** 0-100 — how likely this specific exploitation path actually succeeds. */
  attackSuccessProbability: number;
  /** Plain-language damage estimate, not a fabricated dollar figure. */
  estimatedDamage: string;
  /** 0-100 — the model's own confidence in this assessment, grounded in
   *  what's actually knowable from metadata alone. */
  confidence: number;
  confidenceReasons: string[];
}

export interface AssetSimulation extends SimulationCore {
  assetId: string;
}

export interface ChainSimulation extends SimulationCore {
  chainPossible: boolean;
}

export interface SimulationResponse {
  assets: AssetSimulation[];
  attackChain: ChainSimulation | null;
}
