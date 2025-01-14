/* --------------------------------------------------------------------------------------------
 * Copyright (c) Remy Suen. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from "assert";

import { Position, Range } from 'vscode-languageserver-types';
import { DockerfileParser } from '../src/main';

describe("Dockerfile", () => {
    it("getEscapeCharacter", () => {
        let dockerfile = DockerfileParser.parse("");
        assert.equal(dockerfile.getEscapeCharacter(), "\\");

        dockerfile = DockerfileParser.parse("# escape=\\");
        assert.equal(dockerfile.getEscapeCharacter(), "\\");

        dockerfile = DockerfileParser.parse("# escape=`");
        assert.equal(dockerfile.getEscapeCharacter(), "`");

        // invalid escape directive
        dockerfile = DockerfileParser.parse("# escape=a");
        assert.equal(dockerfile.getEscapeCharacter(), "\\");

        // not a directive, it's a comment
        dockerfile = DockerfileParser.parse("# comment\n# escape=`");
        assert.equal(dockerfile.getEscapeCharacter(), "\\");
    });

    it("getInitialARGs", () => {
        let dockerfile = DockerfileParser.parse("");
        assert.equal(dockerfile.getInitialARGs().length, 0);

        dockerfile = DockerfileParser.parse("FROM alpine\nARG var");
        assert.equal(dockerfile.getInitialARGs().length, 0);

        dockerfile = DockerfileParser.parse("ARG image=alpine\nFROM $image\nARG image=node");
        let args = dockerfile.getInitialARGs();
        assert.equal(args.length, 1);
        let property = args[0].getProperty();
        assert.ok(property !== null);
        assert.equal(property.getName(), "image");
        assert.equal(property.getValue(), "alpine");
    });

    it("getContainingImage", () => {
        let dockerfile = DockerfileParser.parse("FROM alpine");
        let image = dockerfile.getContainingImage(Position.create(0, 1));
        assert.notEqual(image, null);
        image = dockerfile.getContainingImage(Position.create(1, 1));
        assert.equal(image, null);

        dockerfile = DockerfileParser.parse("ARG image\nFROM $image");
        image = dockerfile.getContainingImage(Position.create(0, 1));
        assert.notEqual(image, null);
        let image2 = dockerfile.getContainingImage(Position.create(1, 1));
        assert.notEqual(image2, null);
        assert.ok(image !== image2);
        // line doesn't exist
        image = dockerfile.getContainingImage(Position.create(2, 1));
        assert.equal(image, null);

        dockerfile = DockerfileParser.parse("");
        image = dockerfile.getContainingImage(Position.create(0, 0));
        assert.equal(image, dockerfile);
        image = dockerfile.getContainingImage(Position.create(0, 1));
        assert.equal(image, null);

        dockerfile = DockerfileParser.parse("  ");
        image = dockerfile.getContainingImage(Position.create(0, 0));
        assert.equal(image, dockerfile);
        image = dockerfile.getContainingImage(Position.create(0, 1));
        assert.equal(image, dockerfile);
        image = dockerfile.getContainingImage(Position.create(0, 2));
        assert.equal(image, dockerfile);
        image = dockerfile.getContainingImage(Position.create(0, 3));
        assert.equal(image, null);

        dockerfile = DockerfileParser.parse("#\nFROM busybox");
        image = dockerfile.getContainingImage(Position.create(0, 0));
        assert.equal(image, dockerfile);
        image = dockerfile.getContainingImage(Position.create(0, 1));
        assert.equal(image, dockerfile);

        dockerfile = DockerfileParser.parse("# comment\nFROM busybox");
        image = dockerfile.getContainingImage(Position.create(0, 0));
        assert.equal(image, dockerfile);
        image = dockerfile.getContainingImage(Position.create(0, 1));
        assert.equal(image, dockerfile);

        dockerfile = DockerfileParser.parse("FROM busybox\n# comment");
        image = dockerfile.getContainingImage(Position.create(0, 1));
        image2 = dockerfile.getContainingImage(Position.create(1, 1));
        assert.notEqual(image2, image);
        assert.equal(image2, dockerfile);

        dockerfile = DockerfileParser.parse("FROM busybox\n# comment\nFROM alpine");
        image = dockerfile.getContainingImage(Position.create(1, 1));
        image2 = dockerfile.getContainingImage(Position.create(2, 1));
        assert.notEqual(image2, image);
        assert.equal(image, dockerfile);

        dockerfile = DockerfileParser.parse("FROM busybox\nFROM alpine\n# comment\nFROM node");
        image = dockerfile.getContainingImage(Position.create(2, 1));
        image2 = dockerfile.getContainingImage(Position.create(3, 1));
        assert.notEqual(image2, image);
        assert.equal(image, dockerfile);

        dockerfile = DockerfileParser.parse("ARG version=latest\n# comment");
        image = dockerfile.getContainingImage(Position.create(0, 1));
        image2 = dockerfile.getContainingImage(Position.create(1, 1));
        assert.notEqual(image2, image);

        dockerfile = DockerfileParser.parse("ARG version=latest\n# comment\nFROM busybox:${version}");
        image = dockerfile.getContainingImage(Position.create(0, 1));
        image2 = dockerfile.getContainingImage(Position.create(1, 1));
        assert.notEqual(image2, image);
        image = dockerfile.getContainingImage(Position.create(1, 1));
        image2 = dockerfile.getContainingImage(Position.create(2, 1));
        assert.notEqual(image2, image);
        assert.equal(image, dockerfile);

        dockerfile = DockerfileParser.parse("# comment\nARG version=latest");
        image = dockerfile.getContainingImage(Position.create(0, 1));
        image2 = dockerfile.getContainingImage(Position.create(1, 1));
        assert.notEqual(image2, image);
        assert.equal(image, dockerfile);

        dockerfile = DockerfileParser.parse("ARG version=latest\n# comment");
        image = dockerfile.getContainingImage(Position.create(0, 1));
        image2 = dockerfile.getContainingImage(Position.create(1, 1));
        assert.notEqual(image2, image);
    });

    it("getComments", () => {
        let dockerfile = DockerfileParser.parse("FROM alpine");
        assert.equal(dockerfile.getComments().length, 0);

        dockerfile = DockerfileParser.parse("# escape=`");
        assert.equal(dockerfile.getComments().length, 0);

        dockerfile = DockerfileParser.parse("# Escape=`");
        assert.equal(dockerfile.getComments().length, 0);

        dockerfile = DockerfileParser.parse("# escape");
        assert.equal(dockerfile.getComments().length, 1);

        dockerfile = DockerfileParser.parse("FROM scratch\n# comment\nRUN echo \"$VAR\"");
        assert.equal(dockerfile.getComments().length, 1);
    });

    it("getDirective", () => {
        let dockerfile = DockerfileParser.parse("# escape=`");
        let directive = dockerfile.getDirective();
        assert.ok(directive !== null);

        dockerfile = DockerfileParser.parse("# test=`");
        directive = dockerfile.getDirective();
        assert.ok(directive !== null);
    });

    it("resolveVariable", () => {
        let dockerfile = DockerfileParser.parse(
            "ARG ver=latest\n" +
            "FROM busybox:$ver\n" +
            "ARG ver\n" +
            "RUN echo $ver\n" +
            "FROM busybox:$ver\n" +
            "ARG ver=override\n" +
            "RUN echo $ver\n" +
            "FROM busybox:$ver\n" +
            "RUN echo $ver"
        );
        let from1 = dockerfile.resolveVariable("ver", 1);
        let from2 = dockerfile.resolveVariable("ver", 4);
        let from3 = dockerfile.resolveVariable("ver", 7);
        let run1 = dockerfile.resolveVariable("ver", 3);
        let run2 = dockerfile.resolveVariable("ver", 6);
        let run3 = dockerfile.resolveVariable("ver", 8);
        assert.equal("latest", from1);
        assert.equal("latest", from2);
        assert.equal("latest", from3);
        assert.equal("latest", run1);
        assert.equal("override", run2);
        assert.equal(undefined, run3);

        dockerfile = DockerfileParser.parse(
            "ARG ver=latest\n" +
            "ARG ver\n" +
            "FROM alpine\n" +
            "ARG ver\n" +
            "RUN echo $ver"
        );
        assert.equal(null, dockerfile.resolveVariable("ver", 4));

        dockerfile = DockerfileParser.parse(
            "ENV ver=latest\n " +
            "FROM busybox:$ver\n " +
            "ARG ver\n " +
            "RUN echo $ver"
        );
        assert.equal(null, dockerfile.resolveVariable("ver", 3));

        dockerfile = DockerfileParser.parse(
            "ENV image=alpine\n" +
            "FROM $image"
        );
        assert.strictEqual(undefined, dockerfile.resolveVariable("image", 1));

        dockerfile = DockerfileParser.parse(
            "FROM alpine"
        );
        assert.strictEqual(undefined, dockerfile.resolveVariable("image", -1));

        dockerfile = DockerfileParser.parse(
            "FROM alpine"
        );
        assert.strictEqual(undefined, dockerfile.resolveVariable("image", 1));
    });
});
