import type { AnalysisResult, ReportInput } from '../types'
import { analyzeDeathTiming } from './deathTiming'
import { analyzeFarmEfficiency } from './farmEfficiency'
import { analyzeItemTiming } from './itemTiming'
import { analyzeSituationalItems } from './situationalItems'
import { analyzeLaneOutcome } from './laneOutcome'
import { analyzeHeroPool } from './heroPool'
import { analyzeStackSynergy } from './stackSynergy'
import { analyzeTilt } from './tilt'

export function runAllAnalyses(input: ReportInput): AnalysisResult[] {
  return [
    analyzeDeathTiming(input),
    analyzeFarmEfficiency(input),
    analyzeItemTiming(input),
    analyzeSituationalItems(input),
    analyzeLaneOutcome(input),
    analyzeHeroPool(input),
    analyzeStackSynergy(input),
    analyzeTilt(input),
  ]
}
