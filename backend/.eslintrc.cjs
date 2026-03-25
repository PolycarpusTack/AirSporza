module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-restricted-properties': ['error',
      {
        object: 'prisma',
        property: '$executeRawUnsafe',
        message: 'Use $executeRaw with tagged template literals for parameterized queries',
      },
      {
        property: '$executeRawUnsafe',
        message: 'Use $executeRaw with tagged template literals for parameterized queries',
      },
    ],
  },
  env: {
    node: true,
    es2020: true,
  },
}
