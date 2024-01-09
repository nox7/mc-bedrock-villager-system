import { Vector3 } from "@minecraft/server";
import LengthOfVector from "./LengthOfVector";

export default function(vector: Vector3){
    const magnitude = LengthOfVector(vector);
    return {
        x: vector.x / magnitude,
        y: vector.y / magnitude,
        z: vector.z / magnitude
    }
}