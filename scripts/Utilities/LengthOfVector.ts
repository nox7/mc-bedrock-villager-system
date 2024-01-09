import { Vector3 } from "@minecraft/server";

export default function(vector: Vector3){
    return Math.sqrt( 
        Math.pow(vector.x, 2)
        + Math.pow(vector.y, 2)
        + Math.pow(vector.z, 2)
    );
}