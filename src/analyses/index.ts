import type { AnalysisResult, ReportInput } from '../types'
import { analyzeDeathTiming } from './deathTiming'
import { analyzeFarmEfficiency } from './farmEfficiency'
import { analyzeItemTiming } from './itemTiming'
import { analyzeLaneOutcome } from './laneOutcome'
import { analyzeHeroPool } from './heroPool'
import { analyzeTilt } from './tilt'

export function runAllAnalyses(input: ReportInput): AnalysisResult[] {
  return [
    analyzeDeathTiming(input),
    analyzeFarmEfficiency(input),
    analyzeItemTiming(input),
    analyzeLaneOutcome(input),
    analyzeHeroPool(input),
    analyzeTilt(input),
  ]
}
