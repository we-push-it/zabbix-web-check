// Appended to the generated .discovery_script.test.js by "make test", after the cases and the discovery script
var failed = [];

for (var i = 0; i < cases.length; i++) {
    var accepted = true, error = "";

    try {
        discover(JSON.stringify({config: cases[i].config}));
    } catch (e) {
        accepted = false;
        error = String(e);
    }
    if (accepted !== (cases[i].expect === "accept")) {
        failed.push(cases[i].name + ": expected " + cases[i].expect + ", got " + (accepted ? "accept" : "reject (" + error + ")"));
    }
}
print((cases.length - failed.length) + " of " + cases.length + " cases passed");
if (failed.length > 0) {
    throw new Error(failed.length + " cases failed:\n" + failed.join("\n"));
}
