// SPDX-FileCopyrightText: 2026 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import globals from "globals";
import { defineConfig } from "eslint/config";


const rules = {
    indent: ["off", 4],
    "linebreak-style": ["off", "unix"],
    quotes: ["off", "single"],
    semi: ["error", "always"],
    eqeqeq: ["error", "always"],
    "no-irregular-whitespace": ["off"],
    "no-self-assign": ["off"],
    "no-empty": ["off"],
    "no-useless-escape": ["off"],
    "no-extra-boolean-cast": ["off"],
    "no-prototype-builtins": ["error"],
    "no-use-before-define": ["off"],
    "no-undef": ["error"],
    "no-unused-vars": [ "off" ]
};

export default defineConfig([{
    files: ["**/*.{js,mjs,cjs}"],
    ignores: [
        '/chainpad.dist.js',
        '/chainpad.js',
        '/alltests.js',
        '/randhtml.js',
        '/otaml.js',
        '/client/SHA256.js',
        '/client/sha256/**'
    ],
    languageOptions: {
        globals: { ...globals.node, ...globals.browser, ...globals.amd }
    },
    rules
}]);
