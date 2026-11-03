import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.*;
import skadistats.clarity.Clarity;
import skadistats.clarity.event.Insert;
import skadistats.clarity.model.CombatLogEntry;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.FieldPath;
import skadistats.clarity.processor.entities.*;
import skadistats.clarity.processor.gameevents.OnCombatLogEntry;
import skadistats.clarity.processor.reader.*;
import skadistats.clarity.processor.runner.*;
import skadistats.clarity.processor.stringtables.StringTables;
import skadistats.clarity.processor.stringtables.UsesStringTable;
import skadistats.clarity.source.MappedFileSource;
import skadistats.clarity.wire.shared.common.proto.CommonNetworkBaseTypes.CNETMsg_Tick;
import skadistats.clarity.wire.shared.demo.proto.DemoNetMessages.CSVCMsg_ServerInfo;

/** Offline research probe for the two WK replays in issue #50, not a product parser. */
@UsesEntities
@UsesStringTable("EntityNames")
public class ReplayProbe {
    @Insert private Entities entities;
    @Insert private StringTables stringTables;
    private final Gson gson = new GsonBuilder().serializeNulls().create();
    private final PrintWriter out;
    private final Map<Integer, Entity> landmarks = new LinkedHashMap<>();
    private final Map<Integer, String> lastLandmark = new HashMap<>();
    private final Set<Integer> seenHeroHandles = new HashSet<>();
    private final Set<String> seenClasses = new TreeSet<>();
    private final Set<String> inspectedClasses = new HashSet<>();
    private final Map<Integer, Integer> previousLife = new HashMap<>();
    private Entity rules, resource;
    private int serverTick, rows;
    private Float gameStart;
    private boolean metaSent;

    ReplayProbe(String output) throws IOException {
        out = new PrintWriter(Files.newBufferedWriter(
            Path.of(output), StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW));
    }

    static Map<String, Object> obj(Object... kv) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) result.put((String) kv[i], kv[i + 1]);
        return result;
    }

    void emit(Map<String, Object> value) {
        out.println(gson.toJson(value));
        rows++;
    }

    Object prop(Entity entity, String name) {
        if (entity == null || entity.getFieldPathForName(name) == null) return null;
        return entity.getProperty(name);
    }

    Number num(Entity entity, String name) {
        Object value = prop(entity, name);
        return value instanceof Number ? (Number) value : null;
    }

    Map<String, Object> clock(Context ctx) {
        Number start = num(rules, "m_pGameRules.m_flGameStartTime");
        if (start != null && start.floatValue() != 0) gameStart = start.floatValue();
        Number pausedTicks = num(rules, "m_pGameRules.m_nTotalPausedTicks");
        Number pauseStart = num(rules, "m_pGameRules.m_nPauseStartTick");
        Object paused = prop(rules, "m_pGameRules.m_bGamePaused");
        Number legacy = num(rules, "m_pGameRules.m_fGameTime");
        Double absolute = null;
        if (legacy != null) {
            absolute = legacy.doubleValue();
        } else if (pausedTicks != null && paused instanceof Boolean
                && (!(Boolean) paused || pauseStart != null)) {
            int tick = (Boolean) paused ? pauseStart.intValue() : serverTick;
            absolute = (tick - pausedTicks.intValue()) * (double) ctx.getMillisPerTick() / 1000.0;
        }
        return obj(
            "tick", ctx.getTick(), "serverTick", serverTick, "millisPerTick", ctx.getMillisPerTick(),
            "gameStart", gameStart, "absoluteTime", absolute,
            "gameTime", absolute == null || gameStart == null ? null : absolute - gameStart,
            "paused", paused, "totalPausedTicks", pausedTicks, "pauseStartTick", pauseStart,
            "gameState", prop(rules, "m_pGameRules.m_nGameState"));
    }

    Map<String, Object> point(Entity entity) {
        return obj(
            "handle", entity.getHandle(), "index", entity.getIndex(),
            "class", entity.getDtClass().getDtName(),
            "cell", Arrays.asList(prop(entity, "CBodyComponent.m_cellX"),
                prop(entity, "CBodyComponent.m_cellY"), prop(entity, "CBodyComponent.m_cellZ")),
            "vec", Arrays.asList(prop(entity, "CBodyComponent.m_vecX"),
                prop(entity, "CBodyComponent.m_vecY"), prop(entity, "CBodyComponent.m_vecZ")),
            "team", prop(entity, "m_iTeamNum"), "lifeState", prop(entity, "m_lifeState"),
            "health", prop(entity, "m_iHealth"), "owner", prop(entity, "m_hOwnerEntity"),
            "playerId", prop(entity, "m_iPlayerID"), "unitName", unitName(entity));
    }

    String unitName(Entity entity) {
        Number index = num(entity, "m_pEntity.m_nameStringTableIndex");
        if (index == null || index.intValue() < 0) index = num(entity, "m_pEntity.m_nameStringableIndex");
        if (index == null || index.intValue() < 0) index = num(entity, "m_iUnitNameIndex");
        var table = stringTables.forName("EntityNames");
        if (index == null || index.intValue() < 0 || table == null || !table.hasIndex(index.intValue())) {
            return null;
        }
        return table.getNameByIndex(index.intValue());
    }

    @OnMessage(CNETMsg_Tick.class)
    public void server(CNETMsg_Tick message) {
        serverTick = message.getTick();
    }

    @OnMessage(CSVCMsg_ServerInfo.class)
    public void serverInfo(CSVCMsg_ServerInfo message) {
        emit(obj("kind", "serverInfo", "mapName", message.getMapName(),
            "mapCrc", Integer.toUnsignedLong(message.getMapCrc()),
            "tickInterval", message.getTickInterval(), "gameDir", message.getGameDir()));
    }

    @OnEntityCreated
    public void created(Entity entity) {
        String name = entity.getDtClass().getDtName();
        seenClasses.add(name);
        if (name.equals("CDOTAGamerulesProxy")) rules = entity;
        if (name.equals("CDOTA_PlayerResource")) resource = entity;
        if (name.matches("CDOTA_BaseNPC_(Tower|Barracks|Fort|Watch_Tower|XP_Fountain)"
                + "|CDOTA_Unit_(Fountain|Roshan)|CDOTA_RoshanSpawner")) {
            landmarks.put(entity.getHandle(), entity);
        }
        Number life = num(entity, "m_lifeState");
        if (life != null) previousLife.put(entity.getHandle(), life.intValue());
        if (name.matches("CDOTA_BaseNPC_Tower|CDOTACameraBounds") && inspectedClasses.add(name)) {
            Map<String, Object> fields = new LinkedHashMap<>();
            var it = entity.getState().fieldPathIterator();
            while (it.hasNext()) {
                FieldPath field = it.next();
                String fieldName = entity.getNameForFieldPath(field);
                if (fieldName.contains("Name") || fieldName.contains("name")
                        || fieldName.contains("Origin") || fieldName.contains("Bounds")
                        || fieldName.contains("bounds") || fieldName.contains("Min") || fieldName.contains("Max")) {
                    fields.put(fieldName, entity.getPropertyForFieldPath(field));
                }
            }
            emit(obj("kind", "fields", "class", name, "fields", fields));
        }
    }

    @OnEntityDeleted
    public void deleted(Entity entity) {
        landmarks.remove(entity.getHandle());
        previousLife.remove(entity.getHandle());
    }

    @OnEntityUpdated
    public void updated(Context ctx, Entity entity, FieldPath[] changed, int count) {
        Number life = num(entity, "m_lifeState");
        if (life == null) return;
        Integer before = previousLife.put(entity.getHandle(), life.intValue());
        if (before != null && before == 0 && life.intValue() != 0) {
            emit(obj("kind", "dying", "clock", clock(ctx), "point", point(entity)));
        }
    }

    @OnTickEnd
    public void tick(Context ctx, boolean synthetic) {
        if (synthetic || rules == null) return;
        Map<String, Object> time = clock(ctx);
        if (!metaSent && gameStart != null) {
            emit(obj("kind", "context", "buildNumber", ctx.getBuildNumber(),
                "gameVersion", ctx.getGameVersion(), "clock", time));
            metaSent = true;
        }
        if (resource != null) {
            for (int i = 0; i < 10; i++) {
                String prefix = String.format("m_vecPlayerTeamData.%04d.", i);
                Number id = num(resource, prefix + "m_nSelectedHeroID");
                Number handle = num(resource, prefix + "m_hSelectedHero");
                if (id == null || id.intValue() != 42 || handle == null) continue;
                Entity hero = entities.getByHandle(handle.intValue());
                if (hero == null) continue;
                if (seenHeroHandles.add(hero.getHandle())) {
                    emit(obj("kind", "selection", "resourceIndex", i, "heroId", id,
                        "teamSlot", prop(resource, prefix + "m_iTeamSlot"), "clock", time, "point", point(hero)));
                }
                emit(obj("kind", "hero", "clock", time, "point", point(hero)));
            }
        }
        for (Entity entity : landmarks.values()) {
            Map<String, Object> position = point(entity);
            String value = gson.toJson(position);
            if (!value.equals(lastLandmark.get(entity.getHandle()))) {
                emit(obj("kind", "landmark", "clock", time, "point", position));
                lastLandmark.put(entity.getHandle(), value);
            }
        }
    }

    @OnCombatLogEntry
    public void combat(Context ctx, CombatLogEntry entry) {
        if (!entry.hasType()) return;
        String type = entry.getType().name();
        String target = entry.hasTargetName() ? entry.getTargetName() : null;
        String attacker = entry.hasAttackerName() ? entry.getAttackerName() : null;
        boolean selected = "npc_dota_hero_skeleton_king".equals(target)
            || "npc_dota_hero_skeleton_king".equals(attacker);
        if (!(type.endsWith("DEATH") || type.endsWith("GAME_STATE") || selected
                && (type.endsWith("GOLD") || type.endsWith("XP") || type.endsWith("LAST_HIT")))) return;
        emit(obj("kind", "combat", "type", type, "clock", clock(ctx),
            "timestamp", entry.hasTimestamp() ? entry.getTimestamp() : null,
            "timestampRaw", entry.hasTimestampRaw() ? entry.getTimestampRaw() : null,
            "target", target, "attacker", attacker,
            "targetIllusion", entry.hasTargetIllusion() ? entry.isTargetIllusion() : null,
            "attackerIllusion", entry.hasAttackerIllusion() ? entry.isAttackerIllusion() : null,
            "targetHero", entry.hasTargetHero() ? entry.isTargetHero() : null,
            "attackerHero", entry.hasAttackerHero() ? entry.isAttackerHero() : null,
            "value", entry.hasValue() ? entry.getValue() : null,
            "goldReason", entry.hasGoldReason() ? entry.getGoldReason() : null,
            "locationX", entry.hasLocationX() ? entry.getLocationX() : null,
            "locationY", entry.hasLocationY() ? entry.getLocationY() : null,
            "lastHits", entry.hasLastHits() ? entry.getLastHits() : null,
            "willReincarnate", entry.hasWillReincarnate() ? entry.isWillReincarnate() : null));
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("replay.dem output.jsonl");
        ReplayProbe probe = new ReplayProbe(args[1]);
        try (MappedFileSource source = new MappedFileSource(args[0])) {
            var header = Clarity.headerForFile(args[0]);
            var info = Clarity.infoForFile(args[0]);
            probe.emit(obj("kind", "file", "mapName", header.getMapName(),
                "buildNum", header.hasBuildNum() ? header.getBuildNum() : null,
                "game", header.getGame(), "networkProtocol", header.getNetworkProtocol(),
                "matchId", info.getGameInfo().getDota().getMatchId(),
                "playbackTime", info.getPlaybackTime(), "playbackTicks", info.getPlaybackTicks()));
            new SimpleRunner(source).runWith(probe);
            probe.emit(obj("kind", "complete", "rowsBeforeComplete", probe.rows,
                "gameStart", probe.gameStart, "classes", probe.seenClasses));
        } finally {
            probe.out.close();
        }
        if (probe.out.checkError()) throw new IOException("Replay output write failed");
        System.err.println("Completed " + args[0] + ", rows=" + probe.rows);
    }
}
