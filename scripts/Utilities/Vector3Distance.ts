import { Vector3 } from "@minecraft/server";

export default function(vector: Vector3, otherVector: Vector3){
    return Math.sqrt( 
        Math.pow(otherVector.x - vector.x, 2)
        + Math.pow(otherVector.y - vector.y, 2)
        + Math.pow(otherVector.z - vector.z, 2)
    );
}