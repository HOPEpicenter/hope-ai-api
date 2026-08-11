import {
  isSyntheticVisitorRecord,
  type SyntheticVisitorRecordInput
} from "../visitors/isSyntheticVisitorRecord";

export type SyntheticOperationalRecordInput = SyntheticVisitorRecordInput;

export const isSyntheticOperationalRecord = isSyntheticVisitorRecord;