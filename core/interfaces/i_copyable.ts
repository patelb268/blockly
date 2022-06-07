/** @fileoverview The interface for an object that is copyable. */

/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */



/**
 * The interface for an object that is copyable.
 * @namespace Blockly.ICopyable
 */

/* eslint-disable-next-line no-unused-vars */
/* eslint-disable-next-line no-unused-vars */
import { WorkspaceSvg } from '../workspace_svg.js';

import { ISelectable } from './i_selectable.js';


/** @alias Blockly.ICopyable */
export interface ICopyable extends ISelectable {
  /**
   * Encode for copying.
   * @return Copy metadata.
   */
  toCopyData: AnyDuringMigration;
}
export interface CopyData {
  saveInfo: AnyDuringMigration | Element;
  source: WorkspaceSvg;
  typeCounts: AnyDuringMigration | null;
}