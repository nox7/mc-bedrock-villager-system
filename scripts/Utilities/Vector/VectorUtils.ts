import { Vector3 } from "@minecraft/server";

export class VectorUtils{
    /**
     * Returns if the X,Y,Z components of the vectors are equal.
     * @param vector1
     * @param vector2 
     * @returns 
     */
    public static AreEqual(vector1: Vector3, vector2: Vector3){
        return vector1.x === vector2.x
            && vector1.y === vector2.y
            && vector1.z === vector2.z;
    }

    /**
     * Returns the Vector3 as a comma delimited string
     * @param vector
     */
    public static GetAsString(vector: Vector3): string{
        return `${vector.x}, ${vector.y}, ${vector.z}`;
    }
}