import hooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
export default [{ignores:['dist/**','node_modules/**','public/**']},{files:['**/*.{ts,tsx}'],plugins:{'react-hooks':hooks},languageOptions:{parser:tseslint.parser,parserOptions:{ecmaFeatures:{jsx:true}}},rules:{'no-debugger':'error','no-unreachable':'error','no-constant-condition':'error','no-dupe-args':'error','no-duplicate-case':'error','constructor-super':'error','no-unsafe-finally':'error','valid-typeof':'error'}}];
