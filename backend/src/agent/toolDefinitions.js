// Tool definitions sent to the Claude API.
// VERIFY in the official Anthropic docs: the exact field names
// (name, description, input_schema) and the JSON Schema format.
export const toolDefinitions = [
  {
    name: 'get_bin_status',
    description:
      'Get the current status of all household bins in a zone, including fill level (0-100), daily fill rate, and predicted days until full.',
    input_schema: {
      type: 'object',
      properties: {
        zone: { type: 'string', description: 'Zone name, for example "A".' },
      },
      required: ['zone'],
    },
  },
  {
    name: 'get_weather_forecast',
    description:
      'Get the weather forecast for the collection area. If available is false, the forecast could not be fetched; proceed without it.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_calendar_events',
    description:
      'Get calendar events (including public holidays) between two dates, in YYYY-MM-DD format.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Start date, YYYY-MM-DD.' },
        date_to: { type: 'string', description: 'End date, YYYY-MM-DD.' },
      },
      required: ['date_from', 'date_to'],
    },
  },
  {
    name: 'optimize_route',
    description:
      'Compute the best visiting order for a set of households using the routing service. Returns household IDs in route order.',
    input_schema: {
      type: 'object',
      properties: {
        household_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of the households to visit.',
        },
      },
      required: ['household_ids'],
    },
  },
];