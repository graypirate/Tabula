/*
For silos:
to read a silo, client specifies SiloID and depth
depth - The depth of the silo to read (0 for the silo name and properties, 1 for objects and silos, 2 for nested objects and silos, etc.)
tree - The tree structure at the given SiloID

For objects:
to read an object, client specifies ObjectID and exposure
exposure - The exposure level of the object to read (0 for the object name and properties, 1 for object body, 2 for full properties+body)
*/