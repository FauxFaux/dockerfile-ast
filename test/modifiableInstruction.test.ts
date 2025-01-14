/* --------------------------------------------------------------------------------------------
 * Copyright (c) Remy Suen. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from "assert";

import { Position, Range } from 'vscode-languageserver-types';
import { DockerfileParser, ModifiableInstruction } from '../src/main';

describe("Modifiable Instruction", () => {
    it("getFlags", () => {
        let dockerfile = DockerfileParser.parse("HEALTHCHECK CMD ls");
        let instruction = dockerfile.getInstructions()[0] as ModifiableInstruction;
        assert.equal(instruction.getFlags().length, 0);

        dockerfile = DockerfileParser.parse("HEALTHCHECK CMD ls --help");
        instruction = dockerfile.getInstructions()[0] as ModifiableInstruction;
        assert.equal(instruction.getFlags().length, 0);

        dockerfile = DockerfileParser.parse("HEALTHCHECK -interval=30s CMD ls");
        instruction = dockerfile.getInstructions()[0] as ModifiableInstruction;
        assert.equal(instruction.getFlags().length, 0);

        dockerfile = DockerfileParser.parse("HEALTHCHECK --interval=30s --timeout=10s CMD ls");
        instruction = dockerfile.getInstructions()[0] as ModifiableInstruction;
        assert.equal(instruction.getFlags().length, 2);

        dockerfile = DockerfileParser.parse("COPY . .");
        instruction = dockerfile.getInstructions()[0] as ModifiableInstruction;
        assert.equal(instruction.getFlags().length, 0);
    });
});
