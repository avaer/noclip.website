
import { NameObj, NameObjGroup } from "./NameObj";
import { EffectKeeper } from "./EffectSystem";
import { Spine } from "./Spine";
import { ActorLightCtrl } from "./LightData";
import { vec3, mat4 } from "gl-matrix";
import { SceneObjHolder, getObjectName, FPS, getDeltaTimeFrames } from "./Main";
import { GfxTexture } from "../gfx/platform/GfxPlatform";
import { EFB_WIDTH, EFB_HEIGHT } from "../gx/gx_material";
import { JMapInfoIter, createCsvParser, getJMapInfoScale, getJMapInfoTransLocal, getJMapInfoRotateLocal, getJMapInfoBool } from "./JMapInfo";
import { TextureMapping } from "../TextureHolder";
import { computeModelMatrixSRT, computeEulerAngleRotationFromSRTMatrix } from "../MathHelpers";
import { Camera } from "../Camera";
import { GfxRenderInstManager } from "../gfx/render/GfxRenderer";
import { LightType } from "./DrawBuffer";

import { BMDModelInstance } from "../j3d/render";
import { BRK, BTK, BCK, LoopMode, BVA, BTP, BPK } from '../j3d/j3d';
import * as RARC from '../j3d/rarc';
import * as Viewer from '../viewer';
import { assertExists, fallback } from "../util";
import { RailRider } from "./RailRider";

function setIndirectTextureOverride(modelInstance: BMDModelInstance, sceneTexture: GfxTexture): void {
    const m = modelInstance.getTextureMappingReference("IndDummy");
    if (m !== null)
        setTextureMappingIndirect(m, sceneTexture);
}

export function setTextureMappingIndirect(m: TextureMapping, sceneTexture: GfxTexture): void {
    m.gfxTexture = sceneTexture;
    m.width = EFB_WIDTH;
    m.height = EFB_HEIGHT;
    m.flipY = true;
}

class ActorAnimDataInfo {
    public Name: string;
    public StartFrame: number;
    public IsKeepAnim: boolean;

    constructor(infoIter: JMapInfoIter, animType: string) {
        this.Name = assertExists(infoIter.getValueString(`${animType}Name`));
        this.StartFrame = fallback(infoIter.getValueNumber(`${animType}StartFrame`), -1);
        this.IsKeepAnim = getJMapInfoBool(fallback(infoIter.getValueNumber(`${animType}IsKeepAnim`), -1));
    }
}

function getAnimName(keeperInfo: ActorAnimKeeperInfo, dataInfo: ActorAnimDataInfo): string {
    if (dataInfo.Name)
        return dataInfo.Name;
    else
        return keeperInfo.ActorAnimName;
}

class ActorAnimKeeperInfo {
    public ActorAnimName: string;
    public Bck: ActorAnimDataInfo;
    public Btk: ActorAnimDataInfo;
    public Brk: ActorAnimDataInfo;
    public Bpk: ActorAnimDataInfo;
    public Btp: ActorAnimDataInfo;
    public Bva: ActorAnimDataInfo;

    constructor(infoIter: JMapInfoIter) {
        this.ActorAnimName = assertExists(infoIter.getValueString('ActorAnimName')).toLowerCase();
        this.Bck = new ActorAnimDataInfo(infoIter, 'Bck');
        this.Btk = new ActorAnimDataInfo(infoIter, 'Btk');
        this.Brk = new ActorAnimDataInfo(infoIter, 'Brk');
        this.Bpk = new ActorAnimDataInfo(infoIter, 'Bpk');
        this.Btp = new ActorAnimDataInfo(infoIter, 'Btp');
        this.Bva = new ActorAnimDataInfo(infoIter, 'Bva');
    }
}

export function startBckIfExist(modelInstance: BMDModelInstance, arc: RARC.RARC, animationName: string): boolean {
    const data = arc.findFileData(`${animationName}.bck`);
    if (data !== null) {
        const bck = BCK.parse(data);
        if (animationName.toLowerCase() === 'wait')
            bck.ank1.loopMode = LoopMode.REPEAT;
        modelInstance.bindANK1(bck.ank1);
    }
    return data !== null;
}

export function startBtkIfExist(modelInstance: BMDModelInstance, arc: RARC.RARC, animationName: string): boolean {
    const data = arc.findFileData(`${animationName}.btk`);
    if (data !== null)
        modelInstance.bindTTK1(BTK.parse(data).ttk1);
    return data !== null;
}

export function startBrkIfExist(modelInstance: BMDModelInstance, arc: RARC.RARC, animationName: string): boolean {
    const data = arc.findFileData(`${animationName}.brk`);
    if (data !== null)
        modelInstance.bindTRK1(BRK.parse(data).trk1);
    return data !== null;
}

export function startBpkIfExist(modelInstance: BMDModelInstance, arc: RARC.RARC, animationName: string): boolean {
    const data = arc.findFileData(`${animationName}.bpk`);
    if (data !== null)
        modelInstance.bindTRK1(BPK.parse(data).pak1);
    return data !== null;
}

export function startBtpIfExist(modelInstance: BMDModelInstance, arc: RARC.RARC, animationName: string): boolean {
    const data = arc.findFileData(`${animationName}.btp`);
    if (data !== null)
        modelInstance.bindTPT1(BTP.parse(data).tpt1);
    return data !== null;
}

export function startBvaIfExist(modelInstance: BMDModelInstance, arc: RARC.RARC, animationName: string): boolean {
    const data = arc.findFileData(`${animationName}.bva`);
    if (data !== null)
        modelInstance.bindVAF1(BVA.parse(data).vaf1);
    return data !== null;
}

export function startBck(actor: LiveActor, animName: string): boolean {
    const played = startBckIfExist(actor.modelInstance!, actor.arc, animName);
    if (played && actor.effectKeeper !== null)
        actor.effectKeeper.changeBck(animName);
    return played;
}

class ActorAnimKeeper {
    public keeperInfo: ActorAnimKeeperInfo[] = [];

    constructor(infoIter: JMapInfoIter) {
        for (let i = 0; i < infoIter.getNumRecords(); i++) {
            infoIter.setRecord(i);
            this.keeperInfo.push(new ActorAnimKeeperInfo(infoIter));
        }
    }

    public static tryCreate(actor: LiveActor): ActorAnimKeeper | null {
        let bcsv = actor.arc.findFileData('ActorAnimCtrl.bcsv');

        // Super Mario Galaxy 2 puts these assets in a subfolder.
        if (bcsv === null)
            bcsv = actor.arc.findFileData('ActorInfo/ActorAnimCtrl.bcsv');

        if (bcsv === null)
            return null;

        const infoIter = createCsvParser(bcsv);
        return new ActorAnimKeeper(infoIter);
    }

    public start(actor: LiveActor, animationName: string): boolean {
        animationName = animationName.toLowerCase();
        const keeperInfo = this.keeperInfo.find((info) => info.ActorAnimName === animationName);
        if (keeperInfo === undefined)
            return false;

        // TODO(jstpierre): Separate animation controllers for each player.
        this.setBckAnimation(actor, keeperInfo, keeperInfo.Bck);
        this.setBtkAnimation(actor, keeperInfo, keeperInfo.Btk);
        this.setBrkAnimation(actor, keeperInfo, keeperInfo.Brk);
        this.setBpkAnimation(actor, keeperInfo, keeperInfo.Bpk);
        this.setBtpAnimation(actor, keeperInfo, keeperInfo.Btp);
        this.setBvaAnimation(actor, keeperInfo, keeperInfo.Bva);
        return true;
    }

    private setBckAnimation(actor: LiveActor, keeperInfo: ActorAnimKeeperInfo, dataInfo: ActorAnimDataInfo): void {
        startBck(actor, getAnimName(keeperInfo, dataInfo));
    }

    private setBtkAnimation(actor: LiveActor, keeperInfo: ActorAnimKeeperInfo, dataInfo: ActorAnimDataInfo): void {
        startBtkIfExist(actor.modelInstance!, actor.arc, getAnimName(keeperInfo, dataInfo));
    }

    private setBrkAnimation(actor: LiveActor, keeperInfo: ActorAnimKeeperInfo, dataInfo: ActorAnimDataInfo): void {
        startBrkIfExist(actor.modelInstance!, actor.arc, getAnimName(keeperInfo, dataInfo));
    }

    private setBpkAnimation(actor: LiveActor, keeperInfo: ActorAnimKeeperInfo, dataInfo: ActorAnimDataInfo): void {
        startBpkIfExist(actor.modelInstance!, actor.arc, getAnimName(keeperInfo, dataInfo));
    }

    private setBtpAnimation(actor: LiveActor, keeperInfo: ActorAnimKeeperInfo, dataInfo: ActorAnimDataInfo): void {
        startBtpIfExist(actor.modelInstance!, actor.arc, getAnimName(keeperInfo, dataInfo));
    }

    private setBvaAnimation(actor: LiveActor, keeperInfo: ActorAnimKeeperInfo, dataInfo: ActorAnimDataInfo): void {
        startBvaIfExist(actor.modelInstance!, actor.arc, getAnimName(keeperInfo, dataInfo));
    }
}

export function getPlacedZoneId(sceneObjHolder: SceneObjHolder, infoIter: JMapInfoIter): number {
    const stageDataHolder = assertExists(sceneObjHolder.stageDataHolder.findPlacedStageDataHolder(infoIter));
    return stageDataHolder.zoneId;
}

export function getJMapInfoTrans(dst: vec3, sceneObjHolder: SceneObjHolder, infoIter: JMapInfoIter): void {
    getJMapInfoTransLocal(dst, infoIter);
    const stageDataHolder = assertExists(sceneObjHolder.stageDataHolder.findPlacedStageDataHolder(infoIter));
    vec3.transformMat4(dst, dst, stageDataHolder.placementMtx);
}

const scratchMatrix = mat4.create();
export function getJMapInfoRotate(dst: vec3, sceneObjHolder: SceneObjHolder, infoIter: JMapInfoIter, scratch: mat4 = scratchMatrix): void {
    getJMapInfoRotateLocal(dst, infoIter);

    // Compute local rotation matrix, combine with stage placement, and extract new rotation.
    computeModelMatrixSRT(scratch, 1, 1, 1, dst[0], dst[1], dst[2], 0, 0, 0);
    const stageDataHolder = assertExists(sceneObjHolder.stageDataHolder.findPlacedStageDataHolder(infoIter));
    mat4.mul(scratch, stageDataHolder.placementMtx, scratch);

    computeEulerAngleRotationFromSRTMatrix(dst, scratch);
}

export function makeMtxTRFromActor(dst: mat4, actor: LiveActor): void {
    computeModelMatrixSRT(dst,
        1, 1, 1,
        actor.rotation[0], actor.rotation[1], actor.rotation[2],
        actor.translation[0], actor.translation[1], actor.translation[2]);
}

export const enum LayerId {
    COMMON = -1,
    LAYER_A = 0,
    LAYER_B,
    LAYER_C,
    LAYER_D,
    LAYER_E,
    LAYER_F,
    LAYER_G,
    LAYER_H,
    LAYER_I,
    LAYER_J,
    LAYER_K,
    LAYER_L,
    LAYER_M,
    LAYER_N,
    LAYER_O,
    LAYER_P,
    LAYER_MAX = LAYER_P,
}

export interface ZoneAndLayer {
    zoneId: number;
    layerId: LayerId;
}

export const dynamicSpawnZoneAndLayer: ZoneAndLayer = { zoneId: -1, layerId: LayerId.COMMON };

export const enum MessageType {
    MapPartsRailMover_TryRotate = 0xCB,
    MapPartsRailMover_TryRotateBetweenPoints = 0xCD,
    MapPartsRailMover_Vanish = 0xCF,
}

export class LiveActor<TNerve extends number = number> extends NameObj {
    protected visibleScenario: boolean = true;
    public visibleAlive: boolean = true;
    public visibleModel: boolean = true;
    public boundingSphereRadius: number | null = null;

    public actorAnimKeeper: ActorAnimKeeper | null = null;
    public actorLightCtrl: ActorLightCtrl | null = null;
    public effectKeeper: EffectKeeper | null = null;
    public spine: Spine<TNerve> | null = null;
    public railRider: RailRider | null = null;

    // Technically part of ModelManager.
    public arc: RARC.RARC; // ResourceHolder
    public modelInstance: BMDModelInstance | null = null; // J3DModel

    public translation = vec3.create();
    public rotation = vec3.create();
    public scale = vec3.fromValues(1, 1, 1);
    public velocity = vec3.create();

    constructor(public zoneAndLayer: ZoneAndLayer, sceneObjHolder: SceneObjHolder, public name: string) {
        super(sceneObjHolder, name);
    }

    public receiveMessage(msgType: MessageType): boolean {
        return false;
    }

    public makeActorAppeared(): void {
        this.visibleAlive = true;
    }

    public makeActorDead(): void {
        this.visibleAlive = false;
    }

    public scenarioChanged(sceneObjHolder: SceneObjHolder): void {
        this.visibleScenario = sceneObjHolder.spawner.checkAliveScenario(this.zoneAndLayer);
    }

    public setIndirectTextureOverride(sceneTexture: GfxTexture): void {
        setIndirectTextureOverride(this.modelInstance!, sceneTexture);
    }

    public getBaseMtx(): mat4 | null {
        if (this.modelInstance === null)
            return null;
        return this.modelInstance.modelMatrix;
    }

    public getJointMtx(jointName: string): mat4 | null {
        if (this.modelInstance === null)
            return null;
        return this.modelInstance.getJointToWorldMatrixReference(jointName);
    }

    public static requestArchives(sceneObjHolder: SceneObjHolder, infoIter: JMapInfoIter): void {
        const modelCache = sceneObjHolder.modelCache;

        // By default, we request the object's name.
        const objName = getObjectName(infoIter);
        modelCache.requestObjectData(objName);
    }

    private calcBaseMtxInit(): void {
        if (this.modelInstance !== null) {
            computeModelMatrixSRT(this.modelInstance.modelMatrix,
                1, 1, 1,
                this.rotation[0], this.rotation[1], this.rotation[2],
                this.translation[0], this.translation[1], this.translation[2]);

            vec3.copy(this.modelInstance.baseScale, this.scale);
        }
    }

    public initModelManagerWithAnm(sceneObjHolder: SceneObjHolder, objName: string): void {
        const modelCache = sceneObjHolder.modelCache;

        this.arc = modelCache.getObjectData(objName)!;

        const bmdModel = modelCache.getModel(this.arc, `${objName}.bdl`)!;
        this.modelInstance = new BMDModelInstance(bmdModel);
        this.modelInstance.name = objName;
        this.modelInstance.animationController.fps = FPS;
        this.modelInstance.animationController.phaseFrames = Math.random() * 1500;

        this.calcBaseMtxInit();

        // Compute the joint matrices an initial time in case anything wants to rely on them...
        this.modelInstance.calcJointToWorld();

        // TODO(jstpierre): RE the whole ModelManager / XanimePlayer thing.
        // Seems like it's possible to have a secondary file for BCK animations?
        this.actorAnimKeeper = ActorAnimKeeper.tryCreate(this);
    }

    public initDefaultPos(sceneObjHolder: SceneObjHolder, infoIter: JMapInfoIter | null): void {
        if (infoIter !== null) {
            getJMapInfoTrans(this.translation, sceneObjHolder, infoIter);
            getJMapInfoRotate(this.rotation, sceneObjHolder, infoIter);
            getJMapInfoScale(this.scale, infoIter);
        }

        this.calcBaseMtxInit();
    }

    public initLightCtrl(sceneObjHolder: SceneObjHolder): void {
        this.actorLightCtrl = new ActorLightCtrl(this);
        this.actorLightCtrl.init(sceneObjHolder);
    }

    public initEffectKeeper(sceneObjHolder: SceneObjHolder, groupName: string | null): void {
        if (sceneObjHolder.effectSystem === null)
            return;
        if (groupName === null && this.modelInstance !== null)
            groupName = this.modelInstance.name;
        this.effectKeeper = new EffectKeeper(sceneObjHolder, this, assertExists(groupName));
    }

    public initRailRider(sceneObjHolder: SceneObjHolder, infoIter: JMapInfoIter): void {
        this.railRider = new RailRider(sceneObjHolder, this, infoIter);
    }

    public initNerve(nerve: TNerve): void {
        this.spine = new Spine<TNerve>();
        this.spine.setNerve(nerve);
    }

    public setNerve(nerve: TNerve): void {
        this.spine!.setNerve(nerve);
    }

    public getCurrentNerve(): TNerve {
        return this.spine!.getCurrentNerve() as TNerve;
    }

    public getNerveStep(): number {
        return this.spine!.getNerveStep();
    }

    public startAction(animationName: string): void {
        if (this.actorAnimKeeper === null || !this.actorAnimKeeper.start(this, animationName))
            this.tryStartAllAnim(animationName);
    }

    public tryStartAllAnim(animationName: string): boolean {
        let anyPlayed = false;
        anyPlayed = startBck(this, animationName) || anyPlayed;
        anyPlayed = startBtkIfExist(this.modelInstance!, this.arc, animationName) || anyPlayed;
        anyPlayed = startBrkIfExist(this.modelInstance!, this.arc, animationName) || anyPlayed;
        anyPlayed = startBpkIfExist(this.modelInstance!, this.arc, animationName) || anyPlayed;
        anyPlayed = startBtpIfExist(this.modelInstance!, this.arc, animationName) || anyPlayed;
        anyPlayed = startBvaIfExist(this.modelInstance!, this.arc, animationName) || anyPlayed;
        return anyPlayed;
    }

    public calcAndSetBaseMtx(viewerInput: Viewer.ViewerRenderInput): void {
        makeMtxTRFromActor(this.modelInstance!.modelMatrix, this);
    }

    protected getActorVisible(camera: Camera): boolean {
        if (this.visibleScenario && this.visibleAlive) {
            if (this.boundingSphereRadius !== null)
                return camera.frustum.containsSphere(this.translation, this.boundingSphereRadius);
            else
                return true;
        } else {
            return false;
        }
    }

    public calcViewAndEntry(sceneObjHolder: SceneObjHolder, viewerInput: Viewer.ViewerRenderInput): void {
        if (this.modelInstance === null)
            return;

        // calcAnmMtx
        vec3.copy(this.modelInstance.baseScale, this.scale);
        this.calcAndSetBaseMtx(viewerInput);

        this.modelInstance.animationController.setTimeFromViewerInput(viewerInput);
        this.modelInstance.calcAnim(viewerInput.camera);

        const visible = this.visibleModel && this.getActorVisible(viewerInput.camera);
        this.modelInstance.visible = visible;
        if (!visible)
            return;

        if (this.actorLightCtrl !== null) {
            this.actorLightCtrl.loadLight(this.modelInstance, viewerInput.camera);
        } else {
            // If we don't have an individualized actor light control, then load the default area light.
            // This is basically what DrawBufferExecuter::draw() and DrawBufferGroup::draw() effectively do.

            const lightType = sceneObjHolder.sceneNameObjListExecutor.findLightType(this);
            if (lightType !== LightType.None) {
                const areaLightInfo = sceneObjHolder.lightDirector.findDefaultAreaLight(sceneObjHolder);
                const lightInfo = areaLightInfo.getActorLightInfo(lightType);

                // The reason we don't setAmbient here is a bit funky -- normally how this works
                // is that the J3DModel's DLs will set up the ambient, but when an actor has its
                // own ActorLightCtrl, through a long series of convoluted of actions, the
                // DrawBufferExecutor associated with that actor will stomp on the actor's ambient light
                // configuration. Without this, we're left with the DrawBufferGroup's light configuration,
                // and the actor's DL will override the ambient light there...
                // Rather than emulate the whole DrawBufferGroup system, quirks and all, just hardcode
                // this logic.
                //
                // Specifically, what's going on is that when an actor has an ActorLightCtrl, then the light
                // is loaded in DrawBufferShapeDrawer, *after* the material packet DL has been run. Otherwise,
                // it's loaded in either DrawBufferExecuter or DrawBufferGroup, which run before the material
                // DL, so the actor will overwrite the ambient light. I'm quite sure this is a bug in the
                // original game engine, honestly.
                lightInfo.setOnModelInstance(this.modelInstance, viewerInput.camera, false);
            }
        }
    }

    public movement(sceneObjHolder: SceneObjHolder, viewerInput: Viewer.ViewerRenderInput): void {
        if (this.visibleAlive) {
            const deltaTimeFrames = getDeltaTimeFrames(viewerInput);

            if (this.spine !== null)
                this.spine.update(deltaTimeFrames);

            // updateBinder
            vec3.scaleAndAdd(this.translation, this.translation, this.velocity, deltaTimeFrames);

            if (this.effectKeeper !== null) {
                this.effectKeeper.updateSyncBckEffect(sceneObjHolder.effectSystem!);
                this.effectKeeper.setVisibleScenario(this.visibleAlive && this.visibleScenario);
            }

            if (this.actorLightCtrl !== null)
                this.actorLightCtrl.update(sceneObjHolder, viewerInput.camera, false, deltaTimeFrames);
        }
    }
}

export function isDead(actor: LiveActor): boolean {
    return !actor.visibleAlive;
}

export class LiveActorGroup<T extends LiveActor> extends NameObjGroup<T> {
    public appearAll(): void {
        for (let i = 0; i < this.objArray.length; i++)
            if (isDead(this.objArray[i]))
                this.objArray[i].makeActorAppeared();
    }

    public killAll(): void {
        for (let i = 0; i < this.objArray.length; i++)
            this.objArray[i].makeActorAppeared();
    }

    public getLivingActorNum(): number {
        let count = 0;
        for (let i = 0; i < this.objArray.length; i++)
            if (!isDead(this.objArray[i]))
                ++count;
        return count;
    }

    public getActor(i: number): T {
        return this.objArray[i];
    }

    public getDeadActor(): T | null {
        for (let i = 0; i < this.objArray.length; i++)
            if (isDead(this.objArray[i]))
                return this.objArray[i];
        return null;
    }

    public registerActor(obj: T): void {
        this.registerObj(obj);
    }
}
