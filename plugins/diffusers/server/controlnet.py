"""
ControlNet manager for guided image generation.

Provides ControlNet model loading, preprocessing, and generation capabilities.
"""

from typing import Any, Literal

import cv2
import numpy as np
import torch
from controlnet_aux import CannyDetector, HEDdetector, MidasDetector, OpenposeDetector
from diffusers import ControlNetModel, StableDiffusionControlNetPipeline
from PIL import Image

ControlType = Literal["canny", "depth", "hed", "openpose", "scribble"]


class ControlNetManager:
    """Manages ControlNet models and preprocessors."""

    def __init__(self):
        """Initialize the ControlNet manager with empty caches."""
        self.models: dict[str, ControlNetModel] = {}
        self.pipelines: dict[str, StableDiffusionControlNetPipeline] = {}
        self.preprocessors: dict[str, Any] = {}

    def get_available_types(self) -> list[dict[str, str]]:
        """
        Get metadata for all available ControlNet types.

        Returns:
            List of control type metadata with type, label, and description
        """
        return [
            {
                "type": "canny",
                "label": "Canny Edge",
                "description": "Edge detection using Canny algorithm",
            },
            {
                "type": "depth",
                "label": "Depth Map",
                "description": "Depth estimation using MiDaS",
            },
            {
                "type": "hed",
                "label": "HED Boundary",
                "description": "Holistically-nested edge detection",
            },
            {
                "type": "openpose",
                "label": "OpenPose",
                "description": "Human pose estimation",
            },
            {
                "type": "scribble",
                "label": "Scribble",
                "description": "Hand-drawn scribble guidance",
            },
        ]

    def _get_preprocessor(self, control_type: ControlType) -> Any:
        """
        Get or create preprocessor for the given control type.

        Args:
            control_type: Type of control (canny, depth, etc.)

        Returns:
            Preprocessor instance
        """
        if control_type in self.preprocessors:
            return self.preprocessors[control_type]

        if control_type == "canny":
            preprocessor = CannyDetector()
        elif control_type == "depth":
            preprocessor = MidasDetector.from_pretrained("lllyasviel/Annotators")
        elif control_type == "hed":
            preprocessor = HEDdetector.from_pretrained("lllyasviel/Annotators")
        elif control_type == "openpose":
            preprocessor = OpenposeDetector.from_pretrained("lllyasviel/Annotators")
        elif control_type == "scribble":
            # Scribble doesn't need preprocessing - user draws directly
            preprocessor = None
        else:
            raise ValueError(f"Unknown control type: {control_type}")

        self.preprocessors[control_type] = preprocessor
        return preprocessor

    def preprocess(self, image: Image.Image, control_type: ControlType) -> Image.Image:
        """
        Preprocess image for the given control type.

        Args:
            image: Input PIL Image
            control_type: Type of control preprocessing

        Returns:
            Processed control image
        """
        if control_type == "scribble":
            # For scribble, we expect user to provide the control image directly
            # Convert to grayscale and invert for proper guidance
            img_array = np.array(image.convert("L"))
            return Image.fromarray(255 - img_array)

        preprocessor = self._get_preprocessor(control_type)

        if control_type == "canny":
            # Canny detector expects numpy array
            img_array = np.array(image)
            result = preprocessor(img_array)
            return Image.fromarray(result)
        else:
            # Other preprocessors work with PIL Images
            return preprocessor(image)

    def load_controlnet(self, control_type: ControlType) -> ControlNetModel:
        """
        Load ControlNet model for the given type.

        Args:
            control_type: Type of control

        Returns:
            Loaded ControlNet model
        """
        if control_type in self.models:
            return self.models[control_type]

        print(f"Loading ControlNet model: {control_type}")

        # Map control types to model IDs
        model_map = {
            "canny": "lllyasviel/sd-controlnet-canny",
            "depth": "lllyasviel/sd-controlnet-depth",
            "hed": "lllyasviel/sd-controlnet-hed",
            "openpose": "lllyasviel/sd-controlnet-openpose",
            "scribble": "lllyasviel/sd-controlnet-scribble",
        }

        model_id = model_map.get(control_type)
        if not model_id:
            raise ValueError(f"Unknown control type: {control_type}")

        model = ControlNetModel.from_pretrained(model_id, torch_dtype=torch.float16)

        if torch.cuda.is_available():
            model = model.to("cuda")

        self.models[control_type] = model
        return model

    def generate(
        self,
        prompt: str,
        control_image: Image.Image,
        control_type: ControlType,
        base_model: str = "runwayml/stable-diffusion-v1-5",
        strength: float = 1.0,
        width: int | None = None,
        height: int | None = None,
        num_inference_steps: int = 50,
        guidance_scale: float = 7.5,
        negative_prompt: str | None = None,
        seed: int | None = None,
    ) -> Image.Image:
        """
        Generate image with ControlNet guidance.

        Args:
            prompt: Text prompt for generation
            control_image: Preprocessed control image
            control_type: Type of control
            base_model: Base Stable Diffusion model to use
            strength: ControlNet conditioning scale (0.0-2.0)
            width: Output width (optional)
            height: Output height (optional)
            num_inference_steps: Number of denoising steps
            guidance_scale: Classifier-free guidance scale
            negative_prompt: Negative prompt (optional)
            seed: Random seed (optional)

        Returns:
            Generated PIL Image
        """
        # Load ControlNet model
        controlnet = self.load_controlnet(control_type)

        # Create or retrieve pipeline
        pipeline_key = f"{base_model}:{control_type}"
        if pipeline_key not in self.pipelines:
            print(f"Creating ControlNet pipeline: {pipeline_key}")
            pipeline = StableDiffusionControlNetPipeline.from_pretrained(
                base_model, controlnet=controlnet, torch_dtype=torch.float16
            )
            if torch.cuda.is_available():
                pipeline = pipeline.to("cuda")
            self.pipelines[pipeline_key] = pipeline
        else:
            pipeline = self.pipelines[pipeline_key]

        # Set random seed
        generator = None
        if seed is not None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            generator = torch.Generator(device=device)
            generator.manual_seed(seed)

        # Build generation kwargs
        kwargs: dict[str, Any] = {
            "prompt": prompt,
            "image": control_image,
            "num_inference_steps": num_inference_steps,
            "guidance_scale": guidance_scale,
            "controlnet_conditioning_scale": strength,
            "generator": generator,
        }

        if width is not None:
            kwargs["width"] = width
        if height is not None:
            kwargs["height"] = height
        if negative_prompt is not None:
            kwargs["negative_prompt"] = negative_prompt

        # Generate
        result = pipeline(**kwargs)

        # Extract image
        if hasattr(result, "images"):
            image = result.images[0]
        else:
            image = result[0]

        if not isinstance(image, Image.Image):
            raise ValueError("Expected PIL Image from pipeline")

        return image
