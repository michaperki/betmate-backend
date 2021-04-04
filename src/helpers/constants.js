export function getFieldNotFoundError(fieldName) {
  return `Missing required "${fieldName}" field`;
}

export function getSuccessfulDeletionMessage(id) {
  return `User with id: ${id} was successfully deleted`;
}

export const documentNotFoundError = 'Couldn\'t find resource with given id';

export const PORT = process.env.PORT || 9090;
