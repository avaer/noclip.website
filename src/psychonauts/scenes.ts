
import * as Viewer from '../viewer';
import Progressable from '../Progressable';
import { GfxDevice } from '../gfx/platform/GfxPlatform';
import { fetchData } from '../fetch';
import * as PPF from './ppf';
import { PsychonautsRenderer, SceneRenderer } from './render';

class PsychonautsSceneDesc implements Viewer.SceneDesc {
    constructor(public id: string, public name: string) {
    }

    private fetchPPF(id: string, hasScene: boolean): Progressable<PPF.PPAK> {
        return fetchData(`data/psychonauts/${id}.ppf`).then((buffer) => {
            const ppf = PPF.parse(buffer, hasScene);
            return ppf;
        })
    }

    public createScene(device: GfxDevice): Progressable<Viewer.SceneGfx> {
        return Progressable.all([this.fetchPPF('common', false), this.fetchPPF(this.id, true)]).then(([commonPPF, scenePPF]) => {
            const renderer = new PsychonautsRenderer();
            // TODO(jstpierre): Only translate the textures that are actually used.
            renderer.textureHolder.addTextures(device, commonPPF.textures);
            renderer.textureHolder.addTextures(device, scenePPF.textures);

            const sceneRenderer = new SceneRenderer(device, renderer.textureHolder, scenePPF.mainScene);
            renderer.addSceneRenderer(device, sceneRenderer);
            return renderer;
        });
    }
}

const id = "psychonauts";
const name = "Psychonauts";
const sceneDescs = [
    new PsychonautsSceneDesc("STMU", "Main Menu"),
    "Whispering Rock Summer Camp",
    new PsychonautsSceneDesc("CARE", "Reception Area and Wilderness"),
    new PsychonautsSceneDesc("CARE_Night", "Reception Area and Wilderness (Night)"),
    new PsychonautsSceneDesc("CAMA", "Campgrounds Main"),
    new PsychonautsSceneDesc("CAMA_Night", "Campgrounds Main (Night)"),
    new PsychonautsSceneDesc("CAKC", "Kids' Cabins"),
    new PsychonautsSceneDesc("CAKC_Night", "Kids' Cabins (Night)"),
    new PsychonautsSceneDesc("CABH", "Boathouse and Beach"),
    new PsychonautsSceneDesc("CABH_Night", "Boathouse and Beach (Night)"),
    new PsychonautsSceneDesc("CALI", "Lodge"),
    new PsychonautsSceneDesc("CALI_Night", "Lodge (Night)"),
    new PsychonautsSceneDesc("CAGP", "GPC and Wilderness"),
    new PsychonautsSceneDesc("CAGP_Night", "GPC and Wilderness (Night)"),
    new PsychonautsSceneDesc("CAJA", "Ford's Sanctuary"),
    new PsychonautsSceneDesc("CASA", "Sasha's Underground Lab"),
    new PsychonautsSceneDesc("CABU", "Bunkhouse File Select UI"),
    "Coach Oleander's Basic Braining",
    new PsychonautsSceneDesc("BBA1", "Obstacle Course 1"),
    new PsychonautsSceneDesc("BBA2", "Obstacle Course 2"),
    new PsychonautsSceneDesc("BBLT", "Obstacle Course Finale"),
    "Nightmare in the Brain Tumbler",
    new PsychonautsSceneDesc("NIMP", "The Woods"),
    new PsychonautsSceneDesc("NIBA", "The Braintank"),
    "Sasha's Shooting Gallery",
    new PsychonautsSceneDesc("SACU", "Sasha's Shooting Gallery"),
    "Milla's Dance Party",
    new PsychonautsSceneDesc("MIFL", "The Lounge"),
    new PsychonautsSceneDesc("MIMM", "The Race"),
    new PsychonautsSceneDesc("MILL", "The Party"),
    "Lair of the Lungfish",
    new PsychonautsSceneDesc("LLLL", "Lair of the Lungfish"),
    "Lungfishopolis",
    new PsychonautsSceneDesc("LOMA", "Lungfishopolis"),
    new PsychonautsSceneDesc("LOCB", "Kochamara"),
    "Thorney Towers Home for the Disturbed",
    new PsychonautsSceneDesc("ASGR", "Grounds"),
    new PsychonautsSceneDesc("ASCO", "Lower Floors"),
    new PsychonautsSceneDesc("ASUP", "Upper Floors"),
    new PsychonautsSceneDesc("ASLB", "The Lab of Dr. Lobato"),
    new PsychonautsSceneDesc("ASRU", "Ruins"),
    "The Milkman Conspiracy",
    new PsychonautsSceneDesc("MMI1", "The Neighborhood"),
    new PsychonautsSceneDesc("MMDM", "The Den Morther"),
    "Gloria's Theater",
    new PsychonautsSceneDesc("THMS", "The Stage"),
    new PsychonautsSceneDesc("THCW", "The Catwalks"),
    new PsychonautsSceneDesc("THFB", "Confrontation"),
    "Waterloo World",
    new PsychonautsSceneDesc("WWMA", "Waterloo World"),
    "Black Velvetopia",
    new PsychonautsSceneDesc("BVES", "Edgar's Sancuary"),
    new PsychonautsSceneDesc("BVRB", "Running Against the Bull"),
    new PsychonautsSceneDesc("BVWT", "Tiger"),
    new PsychonautsSceneDesc("BVWE", "Eagle"),
    new PsychonautsSceneDesc("BVWD", "Dragon"),
    new PsychonautsSceneDesc("BVWC", "Cobra"),
    new PsychonautsSceneDesc("BVMA", "Matador's Arena"),
    "Meat Circus",
    new PsychonautsSceneDesc("MCTC", "Tent City"),
    new PsychonautsSceneDesc("MCBB", "The Butcher"),
];

export const sceneGroup: Viewer.SceneGroup = { id, name, sceneDescs };