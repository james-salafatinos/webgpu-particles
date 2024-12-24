# TSL - Threejs Shading Language

## Purpose
- Simpler access to webgpu/wgsl and webgl/glsl

## Architecture
- Node based system
- Nodes have geometry, material, renderer
- Main class is NodeBuilder

## Conversions
- It handles dynamic retyping of properties on the node material, geometry, etc. (like if you have already attributed material.colornode to a color() but then later assign it to vec2() it will be a vec2)
- You can also just method chain to call the representative object to what type you want

## Uniforms

These are the variables for the GPU program - and they can be updated!!

uniform( boolean | number | Color | Vector2 | Vector3 | Vector4 | Matrix3 | Matrix4, type = null )

You can also use kind of a callback if you have a target object that periodically updates, you can say "hey update the shader program when the object updates

.onObjectUpdate( function )
