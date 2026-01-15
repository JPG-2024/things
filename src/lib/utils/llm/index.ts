export function parseLLMJson(string: string) {
  // find the first { and the last }
  let firstCurly = string.indexOf('{');
  const lastCurly = string.lastIndexOf('}');

  if (firstCurly === -1) {
    // add '{' char at start of string
    string = '{' + string;
    firstCurly = 0;
  }
  
  const jsonString = string.substring(firstCurly, lastCurly + 2);

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error('Failed to parse JSON: ' + error);
  }
}