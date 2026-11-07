import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Set;
import opendota.Parse;
import skadistats.clarity.Clarity;

/** Offline, research-only projection of a pinned OpenDota parser. No network or account exports. */
public class LaneReplayProbe extends OutputStream {
    private final ByteArrayOutputStream line = new ByteArrayOutputStream();
    private final BufferedWriter output;
    private boolean epilogue;
    private int rows;
    private static final Set<String> FIELDS = Set.of(
        "time", "type", "slot", "key", "value", "hero_id", "unit", "x", "y", "life_state",
        "hero_damage", "lh", "denies", "gold", "xp", "networth", "kills", "deaths", "assists",
        "attackername", "targetname", "sourcename", "targetsourcename", "inflictor",
        "attackerhero", "targethero", "attackerillusion", "targetillusion");
    LaneReplayProbe(Path path) throws IOException {
        output = Files.newBufferedWriter(path, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
    }
    void emit(JsonObject value) throws IOException {
        output.write(value.toString()); output.newLine(); rows++;
    }
    @Override public void write(int value) throws IOException {
        if (value != '\n') { line.write(value); return; }
        JsonObject raw = JsonParser.parseString(line.toString(StandardCharsets.UTF_8)).getAsJsonObject();
        line.reset();
        String type = raw.get("type").getAsString();
        if (type.equals("epilogue")) { epilogue = true; return; }
        int time = raw.has("time") ? raw.get("time").getAsInt() : 0;
        boolean keep = type.equals("player_slot") || time >= -1 && time <= 660 && Set.of(
            "interval", "DOTA_COMBATLOG_DAMAGE", "DOTA_COMBATLOG_HEAL", "DOTA_COMBATLOG_DEATH").contains(type);
        if (!keep) return;
        JsonObject safe = new JsonObject();
        raw.entrySet().stream().filter(e -> FIELDS.contains(e.getKey())).forEach(e -> safe.add(e.getKey(), e.getValue()));
        emit(safe);
    }
    @Override public void close() throws IOException { output.close(); }
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("replay.dem new-output.jsonl");
        try (var source = Files.newInputStream(Path.of(args[0])); var probe = new LaneReplayProbe(Path.of(args[1]))) {
            JsonObject context = new JsonObject();
            context.addProperty("type", "context");
            context.addProperty("matchId", Clarity.infoForFile(args[0]).getGameInfo().getDota().getMatchId());
            context.addProperty("clock", "OpenDota parser rounded game seconds; not subsecond evidence");
            probe.emit(context);
            new Parse(source, probe, false);
            if (!probe.epilogue || probe.line.size() != 0) throw new IOException("Incomplete replay parse");
            JsonObject complete = new JsonObject(); complete.addProperty("type", "complete");
            complete.addProperty("rowsBeforeComplete", probe.rows); probe.emit(complete);
        }
    }
}
