import Resource from '../models/resource_model';

export function search(queryObject, sort, page, numPerPage) {
  return new Promise((resolve, reject) => {
    Resource.find(queryObject) // Return all results (within limits) if no query
      .sort({ title: sort === 'a' ? -1 : 1 }) // Sort by title
      .skip((page - 1) * numPerPage) // Start at the beginning of the "page"
      .limit(numPerPage) // Limit to the end of the "page"
      .then((results) => {
        resolve(results);
      })
      .catch((error) => {
        console.error(error);
        reject(error);
      });
  });
}

/**
 * NOT IMPLEMENTED, phoenetic search algorithm, can index DB by sound-alike words for spelling checking
 * Would need to be implemented both within resource collection and within search() function
 *
 * Resources:
 * https://en.wikipedia.org/wiki/Soundex
 * http://www.creativyst.com/Doc/Articles/SoundEx1/SoundEx1.htm
 * https://howtodoinjava.com/algorithm/implement-phonetic-search-using-soundex-algorithm/
 *
 * @param {*} queryString String to run soundex processing on
 * @param {*} maxLength Maximum length of a soundex string (algorithm specifies four, not hard limit)
 */
export function soundex(queryString, maxLength = 4) {
  const outputArray = [];

  // Copy query string, remove all but alphabetical characters, and make uppercase
  const queryStringCopy = queryString.slice().replace(/[^A-Z]/gi, '').toUpperCase();

  // Save first letter
  const firstLetter = queryStringCopy.charAt(0);

  // Iterate over all characters within input string and replace according to the soundex algorithm
  for (let c = 0; c < queryString.length; c += 1) {
    switch (queryStringCopy.charAt(c)) {
      case 'B':
      case 'F':
      case 'P':
      case 'V':
        outputArray[c] = '1';
        break;

      case 'C':
      case 'G':
      case 'J':
      case 'K':
      case 'Q':
      case 'S':
      case 'X':
      case 'Z':
        outputArray[c] = '2';
        break;

      case 'D':
      case 'T':
        outputArray[c] = '3';
        break;

      case 'L':
        outputArray[c] = '4';
        break;

      case 'M':
      case 'N':
        outputArray[c] = '5';
        break;

      case 'R':
        outputArray[c] = '6';
        break;

      default:
        outputArray[c] = '0';
        break;
    }
  }

  // Iterate through string and only include non-duplicates of past indexes (of non-zero value)
  let outputString = `${firstLetter}`;
  for (let i = 1; i < outputArray.length; i += 1) {
    if (outputArray[i] !== outputArray[i - 1] && outputArray[i] !== '0') {
      outputString += outputArray[i];
    }
  }

  // Pad output to maxLength characters with '0' and maintain max string length
  outputString = outputString.padEnd(maxLength, '0').slice(0, maxLength);

  return outputString;
}

const searchController = { search, soundex };

export default searchController;
