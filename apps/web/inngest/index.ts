import type { InngestFunction } from 'inngest';
import { movesSweep } from './moves-sweep';

/** Registry of every background function. Each workstream adds its functions here. */
export const functions: InngestFunction.Any[] = [movesSweep];
