# Code Patterns

## MCP Tool Registration

```typescript
server.registerTool(
  "tool_name",
  {
    description: "Tool description",
    inputSchema: { path: z.string().describe("Path description") },
  },
  async (args) => {
    const pathValidation = await validatePath(args.path);
    if (!pathValidation.valid) {
      return createErrorResponse(pathValidation.error);
    }
    // Implementation
    return createSuccessResponse(result, { itemCount: items.length });
  }
);
```

## Error Handling

- Structured errors with code, message, context
- Codes: `PATH_NOT_FOUND`, `PARSE_ERROR`, `UNSUPPORTED_LANGUAGE`, `TOOL_NOT_AVAILABLE`
- Set `isError: true` for error responses

## Testing

```typescript
const handler = getToolHandler(registerMyTool, "tool_name");
const response = await handler({ path: testDir });
const result = parseContent<ResultType>(response);
```
