/** @fileoverview Object representing a map of variables and their types. */

/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * Object representing a map of variables and their types.
 * @class
 */

// Unused import preserved for side-effects. Remove if unneeded.
import './events/events_var_delete';
// Unused import preserved for side-effects. Remove if unneeded.
import './events/events_var_rename';

/* eslint-disable-next-line no-unused-vars */
import { Block } from './block.js';
import * as dialog from './dialog.js';
import * as eventUtils from './events/utils.js';
import { Msg } from './msg.js';
import { Names } from './names.js';
import * as arrayUtils from './utils/array.js';
import * as idGenerator from './utils/idgenerator.js';
import { VariableModel } from './variable_model.js';
/* eslint-disable-next-line no-unused-vars */
import { Workspace } from './workspace.js';


/**
 * Class for a variable map.  This contains a dictionary data structure with
 * variable types as keys and lists of variables as values.  The list of
 * variables are the type indicated by the key.
 * @alias Blockly.VariableMap
 */
export class VariableMap {
  private variableMap_: { [key: string]: VariableModel[] };

  /** @param workspace The workspace this map belongs to. */
  constructor(public workspace: Workspace) {
    /**
     * A map from variable type to list of variable names.  The lists contain
     * all of the named variables in the workspace, including variables that are
     * not currently in use.
     */
    this.variableMap_ = Object.create(null);
  }

  /** Clear the variable map. */
  clear() {
    this.variableMap_ = Object.create(null);
  }
  /* Begin functions for renaming variables. */
  /**
   * Rename the given variable by updating its name in the variable map.
   * @param variable Variable to rename.
   * @param newName New variable name.
   */
  renameVariable(variable: VariableModel, newName: string) {
    const type = variable.type;
    const conflictVar = this.getVariable(newName, type);
    const blocks = this.workspace.getAllBlocks(false);
    eventUtils.setGroup(true);
    try {
      // The IDs may match if the rename is a simple case change (name1 ->
      // Name1).
      if (!conflictVar || conflictVar.getId() === variable.getId()) {
        this.renameVariableAndUses_(variable, newName, blocks);
      } else {
        this.renameVariableWithConflict_(
          variable, newName, conflictVar, blocks);
      }
    } finally {
      eventUtils.setGroup(false);
    }
  }

  /**
   * Rename a variable by updating its name in the variable map. Identify the
   * variable to rename with the given ID.
   * @param id ID of the variable to rename.
   * @param newName New variable name.
   */
  renameVariableById(id: string, newName: string) {
    const variable = this.getVariableById(id);
    if (!variable) {
      throw Error('Tried to rename a variable that didn\'t exist. ID: ' + id);
    }

    this.renameVariable(variable, newName);
  }

  /**
   * Update the name of the given variable and refresh all references to it.
   * The new name must not conflict with any existing variable names.
   * @param variable Variable to rename.
   * @param newName New variable name.
   * @param blocks The list of all blocks in the workspace.
   */
  private renameVariableAndUses_(
    variable: VariableModel, newName: string, blocks: Block[]) {
    eventUtils.fire(new (eventUtils.get(eventUtils.VAR_RENAME))!
      (variable, newName));
    variable.name = newName;
    for (let i = 0; i < blocks.length; i++) {
      blocks[i].updateVarName(variable);
    }
  }

  /**
   * Update the name of the given variable to the same name as an existing
   * variable.  The two variables are coalesced into a single variable with the
   * ID of the existing variable that was already using newName. Refresh all
   * references to the variable.
   * @param variable Variable to rename.
   * @param newName New variable name.
   * @param conflictVar The variable that was already using newName.
   * @param blocks The list of all blocks in the workspace.
   */
  private renameVariableWithConflict_(
    variable: VariableModel, newName: string, conflictVar: VariableModel,
    blocks: Block[]) {
    const type = variable.type;
    const oldCase = conflictVar.name;

    if (newName !== oldCase) {
      // Simple rename to change the case and update references.
      this.renameVariableAndUses_(conflictVar, newName, blocks);
    }

    // These blocks now refer to a different variable.
    // These will fire change events.
    for (let i = 0; i < blocks.length; i++) {
      blocks[i].renameVarById(variable.getId(), conflictVar.getId());
    }
    // Finally delete the original variable, which is now unreferenced.
    eventUtils.fire(new (eventUtils.get(eventUtils.VAR_DELETE))!(variable));
    // And remove it from the list.
    arrayUtils.removeElem(this.variableMap_[type], variable);
  }
  /* End functions for renaming variables. */
  /**
   * Create a variable with a given name, optional type, and optional ID.
   * @param name The name of the variable. This must be unique across variables
   *     and procedures.
   * @param opt_type The type of the variable like 'int' or 'string'.
   *     Does not need to be unique. Field_variable can filter variables based
   * on their type. This will default to '' which is a specific type.
   * @param opt_id The unique ID of the variable. This will default to a UUID.
   * @return The newly created variable.
   */
  createVariable(name: string, opt_type?: string | null, opt_id?: string | null):
    VariableModel {
    let variable = this.getVariable(name, opt_type);
    if (variable) {
      if (opt_id && variable.getId() !== opt_id) {
        throw Error(
          'Variable "' + name + '" is already in use and its id is "' +
          variable.getId() + '" which conflicts with the passed in ' +
          'id, "' + opt_id + '".');
      }
      // The variable already exists and has the same ID.
      return variable;
    }
    if (opt_id && this.getVariableById(opt_id)) {
      throw Error('Variable id, "' + opt_id + '", is already in use.');
    }
    const id = opt_id || idGenerator.genUid();
    const type = opt_type || '';
    variable = new VariableModel(this.workspace, name, type, id);

    const variables = this.variableMap_[type] || [];
    variables.push(variable);
    // Delete the list of variables of this type, and re-add it so that
    // the most recent addition is at the end.
    // This is used so the toolbox's set block is set to the most recent
    // variable.
    delete this.variableMap_[type];
    this.variableMap_[type] = variables;

    return variable;
  }
  /* Begin functions for variable deletion. */
  /**
   * Delete a variable.
   * @param variable Variable to delete.
   */
  deleteVariable(variable: VariableModel) {
    const variableId = variable.getId();
    const variableList = this.variableMap_[variable.type];
    for (let i = 0; i < variableList.length; i++) {
      const tempVar = variableList[i];
      if (tempVar.getId() === variableId) {
        variableList.splice(i, 1);
        eventUtils.fire(new (eventUtils.get(eventUtils.VAR_DELETE))!(variable));
        return;
      }
    }
  }

  /**
   * Delete a variables by the passed in ID and all of its uses from this
   * workspace. May prompt the user for confirmation.
   * @param id ID of variable to delete.
   */
  deleteVariableById(id: string) {
    const variable = this.getVariableById(id);
    if (variable) {
      // Check whether this variable is a function parameter before deleting.
      const variableName = variable.name;
      const uses = this.getVariableUsesById(id);
      for (let i = 0, block; block = uses[i]; i++) {
        if (block.type === 'procedures_defnoreturn' ||
          block.type === 'procedures_defreturn') {
          const procedureName = String(block.getFieldValue('NAME'));
          const deleteText = Msg['CANNOT_DELETE_VARIABLE_PROCEDURE']
            .replace('%1', variableName)
            .replace('%2', procedureName);
          dialog.alert(deleteText);
          return;
        }
      }

      const map = this;
      if (uses.length > 1) {
        // Confirm before deleting multiple blocks.
        const confirmText = Msg['DELETE_VARIABLE_CONFIRMATION']
          .replace('%1', String(uses.length))
          .replace('%2', variableName);
        dialog.confirm(confirmText, function (ok) {
          if (ok && variable) {
            map.deleteVariableInternal(variable, uses);
          }
        });
      } else {
        // No confirmation necessary for a single block.
        map.deleteVariableInternal(variable, uses);
      }
    } else {
      console.warn('Can\'t delete non-existent variable: ' + id);
    }
  }

  /**
   * Deletes a variable and all of its uses from this workspace without asking
   * the user for confirmation.
   * @param variable Variable to delete.
   * @param uses An array of uses of the variable.
   */
  deleteVariableInternal(variable: VariableModel, uses: Block[]) {
    const existingGroup = eventUtils.getGroup();
    if (!existingGroup) {
      eventUtils.setGroup(true);
    }
    try {
      for (let i = 0; i < uses.length; i++) {
        uses[i].dispose(true);
      }
      this.deleteVariable(variable);
    } finally {
      if (!existingGroup) {
        eventUtils.setGroup(false);
      }
    }
  }
  /* End functions for variable deletion. */
  /**
   * Find the variable by the given name and type and return it.  Return null if
   *     it is not found.
   * @param name The name to check for.
   * @param opt_type The type of the variable.  If not provided it defaults to
   *     the empty string, which is a specific type.
   * @return The variable with the given name, or null if it was not found.
   */
  getVariable(name: string, opt_type?: string | null): VariableModel | null {
    const type = opt_type || '';
    const list = this.variableMap_[type];
    if (list) {
      for (let j = 0, variable; variable = list[j]; j++) {
        if (Names.equals(variable.name, name)) {
          return variable;
        }
      }
    }
    return null;
  }

  /**
   * Find the variable by the given ID and return it.  Return null if not found.
   * @param id The ID to check for.
   * @return The variable with the given ID.
   */
  getVariableById(id: string): VariableModel | null {
    const keys = Object.keys(this.variableMap_);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      for (let j = 0, variable; variable = this.variableMap_[key][j]; j++) {
        if (variable.getId() === id) {
          return variable;
        }
      }
    }
    return null;
  }

  /**
   * Get a list containing all of the variables of a specified type. If type is
   *     null, return list of variables with empty string type.
   * @param type Type of the variables to find.
   * @return The sought after variables of the passed in type. An empty array if
   *     none are found.
   */
  getVariablesOfType(type: string | null): VariableModel[] {
    type = type || '';
    const variableList = this.variableMap_[type];
    if (variableList) {
      return variableList.slice();
    }
    return [];
  }

  /**
   * Return all variable and potential variable types.  This list always
   * contains the empty string.
   * @param ws The workspace used to look for potential variables. This can be
   *     different than the workspace stored on this object if the passed in ws
   *     is a flyout workspace.
   * @return List of variable types.
   */
  getVariableTypes(ws: Workspace | null): string[] {
    const variableMap = {};
    Object.assign(variableMap, this.variableMap_);
    if (ws && ws.getPotentialVariableMap()) {
      Object.assign(variableMap, ws.getPotentialVariableMap()!.variableMap_);
    }
    const types = Object.keys(variableMap);
    let hasEmpty = false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === '') {
        hasEmpty = true;
      }
    }
    if (!hasEmpty) {
      types.push('');
    }
    return types;
  }

  /**
   * Return all variables of all types.
   * @return List of variable models.
   */
  getAllVariables(): VariableModel[] {
    let allVariables: AnyDuringMigration[] = [];
    for (const key in this.variableMap_) {
      allVariables = allVariables.concat(this.variableMap_[key]);
    }
    return allVariables;
  }

  /**
   * Returns all of the variable names of all types.
   * @return All of the variable names of all types.
   */
  getAllVariableNames(): string[] {
    const allNames = [];
    for (const key in this.variableMap_) {
      const variables = this.variableMap_[key];
      for (let i = 0, variable; variable = variables[i]; i++) {
        allNames.push(variable.name);
      }
    }
    return allNames;
  }

  /**
   * Find all the uses of a named variable.
   * @param id ID of the variable to find.
   * @return Array of block usages.
   */
  getVariableUsesById(id: string): Block[] {
    const uses = [];
    const blocks = this.workspace.getAllBlocks(false);
    // Iterate through every block and check the name.
    for (let i = 0; i < blocks.length; i++) {
      const blockVariables = blocks[i].getVarModels();
      if (blockVariables) {
        for (let j = 0; j < blockVariables.length; j++) {
          if (blockVariables[j].getId() === id) {
            uses.push(blocks[i]);
          }
        }
      }
    }
    return uses;
  }
}