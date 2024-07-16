export const handler = async (event, context) => {
  console.log(event)
  return event.arguments;
};