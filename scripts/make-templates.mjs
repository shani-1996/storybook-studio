// One-off generator for the remaining profession templates (same shape as doctor.json). Safe to re-run.
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../content/stories/when-i-grow-up/templates/", import.meta.url));
const COMPOSITION = "child on the left two-thirds, right third kept light and empty for text";

// [id, scene, outfit] -- every scene is child-safe: friendly, bright, no danger, no text or logos in the picture.
const professions = [
  ["scientist", "child in a white lab coat and safety goggles pushed up on the head, holding a bubbling coloured flask, tidy bench with a microscope, soft green watercolour wash", "white lab coat with goggles"],
  ["artist", "child in a paint-splashed smock holding a big paintbrush beside an easel with a colourful abstract painting, rainbow watercolour splashes behind", "paint-splashed smock and a beret"],
  ["footballer", "child in a bright football kit with a ball at their feet on a sunny grass pitch, simple goal behind, fresh green watercolour wash", "plain bright football shirt and shorts, no logos, no numbers"],
  ["cricketer", "child in white cricket clothes holding a small bat on a sunny green field, stumps behind, clear blue sky wash", "white cricket shirt and trousers with a sun hat"],
  ["engineer", "child in a yellow hard hat and hi-vis vest holding a rolled blueprint, beside a friendly toy bridge made of blocks, warm orange watercolour wash", "yellow hard hat and hi-vis vest"],
  ["teacher", "child standing by a blackboard with a pointer, holding a picture book, a few drawn shapes and stars on the board (no letters or numbers), cosy classroom wash", "cardigan and round glasses"],
  ["musician", "child playing a small guitar, floating musical notes drawn as simple swirls (no letters), warm purple and gold watercolour wash", "colourful waistcoat"],
  ["firefighter", "child in a red firefighter helmet and jacket beside a friendly red fire engine, sunny sky wash, no flames and no smoke anywhere", "red helmet and jacket with reflective stripes"],
  ["veterinarian", "child in a soft blue scrub top holding a toy stethoscope, gently cuddling a calm fluffy puppy with a kitten nearby, light teal watercolour wash", "blue scrub top"],
  ["architect", "child in a smart shirt holding a small model house and a pencil, a drawing table with a simple house plan (no text), soft blue-grey watercolour wash", "smart shirt with rolled-up sleeves"],
  ["photographer", "child holding a toy camera up to take a picture, a bright scene of balloons and flowers behind, soft peach watercolour wash", "denim jacket with a camera strap"],
  ["explorer", "child in a sun hat and small backpack holding a magnifying glass at the edge of a friendly forest, a tiny map in the other hand (no text), leafy green and gold watercolour wash", "sun hat, explorer vest and a small backpack"],
];

for (const [id, scene, outfit] of professions) {
  const file = `${dir}${id}.json`;
  if (existsSync(file)) continue;
  const t = {
    id,
    titleWord: id.toUpperCase(),
    textSide: "right",
    scene,
    outfit: { girl: outfit, boy: outfit, neutral: outfit },
    composition: COMPOSITION,
  };
  writeFileSync(file, JSON.stringify(t, null, 2) + "\n");
  console.log("wrote", id);
}
