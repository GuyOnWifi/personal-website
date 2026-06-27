---
title: building a neural net from scratch
description: training an mnist classifier in pure numpy, no tensorflow or pytorch, with a 1000x speedup from vectorization.
date: 2025-02-08
tags: [machine learning, python, numpy]
---

_Building a Neural Network from Scratch: No TensorFlow, No PyTorch, Just Numpy (+ Working Demo)_
================================================================================================

![Structure of a multi-layer perceptron. Layer sizes have been simplified but it still does a good job showing the connections between each neuron. (Source: GeeksforGeeks)](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*5tcTMuWpJrURY67jXgy4zQ.png)

[Original on Medium](https://medium.com/@easonh887/building-a-neural-network-from-scratch-no-tensorflow-or-pytorch-working-demo-8cc2b9061681)


I built a neural network from scratch — no TensorFlow, no PyTorch — and achieved 97% accuracy on the MNIST dataset. Here’s how I did it.

<iframe src="https://codesandbox.io/embed/7jnfgv?view=preview"
     style="width:100%; height: 500px; border:0; border-radius: 4px; overflow:hidden;"
     title="neural-net"
     allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
     sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
></iframe>

> Try drawing an image in the box! For best results, try to draw the digit in the center and take around 80% of the space. You’ll have to forgive the model if it doesn’t work as well with your digits, it was trained on MNIST digits which has a much more different image processing algorithm that I am unable to reconstruct. Factors like image location, rotation, brush size, etc, will influence how well the model performs outside of it’s training data.

You can try out the digit recognizer here: [https://guyonwifi.github.io/neural-net/](https://guyonwifi.github.io/neural-net/), or on the demo above.

In this article, I will be covering:

*   Motivation behind this project & what I’ve learned
*   The multi-layer perceptron and how it works (feedforward, backpropagation, gradient descent)
*   The math behind neural networks
*   Code of a neural network implementation in Python & important optimizations (vectorization, CUDA, etc)

All of the code can be found here on Github: [https://github.com/GuyOnWifi/neural-net](https://github.com/GuyOnWifi/neural-net)

Motivation
----------

Neural networks are a fantastic algorithm: they have so many parameters that can be tuned to continuously learn and improve. I wanted to get a strong, intuitive understanding of how these networks learn; and what better way to do so than coding one from scratch? I wanted to try it without any external libraries such as PyTorch or Tensorflow/Keras doing all the heavy lifting for you, just numpy and a whole lot of calculus + linear algebra. Throughout this project, I’ve gotten a really deep understanding of what actually goes behind how these networks actually learn and improve

How the Model Works
-------------------

The network I made is called a **multilayer perceptron**. The training can be broken down into two main phases: the feedforward phase where inputs are fed through the network, and then the backpropagation phase where the “learning” is calculated and the model’s parameters are updated.

### Multilayer Perceptron

The multilayer perceptron is made up of the input later, then hidden layers of neurons, and finally an output layer. Each layer contains “neurons”, which hold a number (known as an **activation**) in them. Each neuron is connected to every other neuron in the layers before and after it. Each neuron’s values depend on the neuron’s before it, and the model through its many tunable parameters, is able to learn patterns from the input neurons to spit out the correct output neurons. We’ll go through exactly how the neuron’s activations are calculated in the next section.

The sample model I trained takes in a 28x28 greyscale image of a single digit from 0–9, feeds it to a hidden layer of 80 neurons, then another layer of 80 neurons, and finally outputs 10 values. The first value of the output layer represents the probability it is a 0, the second represents the probability of 1, etc.

### Feedforward

Each neuron has an activation, which is essentially the output of the neuron. Each connection between neurons of two adjacent layers have a weight, and every output neuron has an associated bias. The weighted sums each neuron is the activation multiplied by the weights of each connected node, with another biases added on.

$$
z_i = \sum_{j=1}^{n} w_{ij} a_{\text{prev},j} + b_i
$$

The weighted sum is put through an **activation function** to get the final activations. The activation is a non-linearity (a function that has a more complex shape than a line, such as a curve), and introduces complexity to the model. Without an activation function, the whole network is a glorified linear transformation, and wouldn’t be able to model complex tasks like image recognition.

Let’s go through how the feedforward is represented mathematically. A layer’s activations is represented as a (_n_ x 1) vector of all of the individual activations.

$$
\mathbf{a} = \begin{pmatrix} a_1 \\ 
a_2 \\ 
\vdots \\ 
a_n \end{pmatrix}
$$

Each weight is represented by a (_m_ x _n_) matrix, where _n_ is the number of input neurons and _m_ is the number of output neurons.

Each weight **_w[i][j]_** represents the connection between the j-th input neuron to the i-th ouput neuron.

$$
\mathbf{w} = \begin{pmatrix} 
w_{1,1} & w_{1,2} & \cdots & w_{1,n} \\
w_{2,1} & w_{2,2} & \cdots & w_{2,n} \\
\vdots & \vdots & \ddots & \vdots \\
w_{m,1} & w_{m,2} & \cdots & w_{m,n}
\end{pmatrix}
$$

The bias can be represented as a (_m_ x 1) matrix, _m_ representing the number of output neurons

$$
\mathbf{b} = \begin{pmatrix} b_1 \\ 
b_2 \\ 
\vdots \\ 
b_m \end{pmatrix}
$$

The weighted sums **z** can be represented as the dot product of the activations and weights matrix, plus the bias matrix

$$
\mathbf{z} = \begin{pmatrix} w_{1,1} & w_{1,2} & \cdots & w_{1,n} \\
w_{2,1} & w_{2,2} & \cdots & w_{2,n} \\
\vdots & \vdots & \ddots & \vdots \\
w_{m,1} & w_{m,2} & \cdots & w_{m,n} \end{pmatrix}
\begin{pmatrix} a_1 \\ 
a_2 \\ 
\vdots \\ 
a_n \end{pmatrix}
+
\begin{pmatrix} b_1 \\ 
b_2 \\ 
\vdots \\ 
b_m \end{pmatrix}
$$

which expands out to

$$
\mathbf{z} =
\begin{pmatrix} w_{1, 1} \cdot a_1 + w_{1, 2} \cdot a_2 + \cdots + w_{1, n} \cdot a_n + b_1 \\
w_{2, 1} \cdot a_1 + w_{2, 2} \cdot a_2 + \cdots + w_{2, n} \cdot a_n + b_2 \\
\vdots \\
w_{m, 1} \cdot a_1 + w_{m, 2} \cdot a_2 + \cdots + w_{m, n} \cdot a_n + b_m \end{pmatrix}
$$

which is our weighted sum formula!

The output weighted sums is then put through the activation function. My model supports three: ReLU, sigmoid and softmax. These functions are specifically chosen for their non-linear properties.

$$
\text{ReLU}(z) = \max(0, z)
$$

$$
\text{sigmoid}(z) = \frac{1}{1 + e^{-z}}
$$

$$
\text{softmax}(\mathbf{z})_i = \frac{e^{z_i}}{\sum_{j=1}^{K} e^{z_j}}
$$

ReLU is usually picked over the sigmoid activation function because it is much faster to compute, and learns faster due to the derivative being one when z > 0. Sigmoid’s derivative becomes very small if z gets too small or too large, resulting in learning slow down (this is known as **vanishing gradient**).

The softmax function is typically used in the last layer of the network, and converts all of the raw output activations (**logits**) into probabilities (out of 100%). It’s different from simple normalization (where we divide each logit by the total sum) because it applies exponentiation, giving more weight to inputs that are much larger than others. This makes it perfect for image classification tasks where we want the probability of a match.

My model uses ReLU activations with a softmax activation for the final layer.

The activations of the current layer are used as the inputs to the next layer, hence the name “feedforward”.

### Cost Function

We can’t talk about neural networks without some kind of **cost function**. A cost function computes the “cost” or the error from the expected values based on the final output activations. It is a numerical way to represent how good the model is behaving. My model supports two cost functions: MSE (mean-squared-error) and cross-entropy.

Note that y[i] represents the actual, expected value for the i-th data point, and that y_hat[i] represents the value predicted by the model.

$$
\text{MSE} = \frac{1}{n} \sum_{i=1}^{n} (y_i - \hat{y}_i)^2
$$

$$
\text{Cross-Entropy} = -\sum_{i=1}^{n} y_i \log(\hat{y}_i)
$$

Cross-entropy is better suited for classification because it penalizes incorrect predictions more heavily, leading to faster convergence, while MSE is usually preferred for regression tasks. My model uses cross-entropy.

Since the cost is a metric for how well the model is performing, as you can expect, **the goal of any neural network is to minimize the cost.**

### Backpropagation

The heart of machine learning lies in the backpropagation algorithm. It computes the **gradient** of the cost function, or how sensitive a small change in a weight/bias is to the overall cost. For those of you familiar with calculus, you’ll realize that it is just the _derivative of the cost function_. In order to reach a minimum, we perform what’s known as **stochastic gradient descent.** We take the slope of the function at that point and follow that until we reach a minimum.

Think about it as a ball rolling down a hill, the ball representing our current model and the hill representing the cost function we are trying to minimize. We compute how steep and in which direction the hill is going (the derivative), and we “roll the ball” based on the slope. The goal is to keep following the “hill” until we reach a minimum point.

![Gradient Descent](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*DpRBfxPbGljCO9tyU-mA0g.gif)

### Batches

One important part of stochastic gradient descent is the fact that the gradients are calculated in **batches.** The training data is grouped into batches and the gradient for every batch is calculated. The gradients are averaged and then used to update the model. In traditional **gradient descent**, the whole training set is used and averaged.

The benefit of having batches that the model can be trained much faster with lower memory usage due to the smaller batch sizes. However, this results in the model being nosier and jumping around a lot more than if the entire training set was used, which might make it take longer to reach a minimum. It’s a trade off between computational efficiency, memory usage, model accuracy and training times. My model uses stochastic gradient descent due to faster iterations of training and lower memory usage.

![Stochastic gradient descent is much nosier, but isn’t as resource-intensive](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*iW-dRtufDPZUv5hH-Ylc_Q.png)

### Learn Rate

Finally, once all the gradients are computed, it is multiplied by a factor, called the **learn rate,** typically a small number like 0.01. The weights and biases are updated by subtracting the scaled gradient. The reason for this is that the gradients compute the instantaneous rate of change, and multiplying it by too big of a number ruins that approximation.

![captionless image](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*EKOxTJRkrF_mW6xbFNbCzg.png)

### The Math Behind Backpropagation

In this section, we’ll be computing all of the relevant partial derivatives and actually doing all of the math needed to train the model. If you’re like me and want to have a solid understanding of these networks that go beyond basic intuition and analogies, then this section will be perfect for you. As you can guess, the math needed for backpropagation involves differentiation and calculus. As long as you’re familiar with the chain rule, most of the math is fairly straightforward.

We start off by computing the partial derivative of the last layer’s activation with respect to the cost function. This depends on which cost function we use (MSE or Cross Entropy)

$$
\frac{\partial C}{\partial a_i} = \frac{2}{n}(y_i - \hat{y}_i)
$$
*For MSE*

$$
\frac{\partial C}{\partial a_i} = -\frac{y_i}{\hat{y}_i}
$$
*For Cross Entropy*

For each layer, we’ll need to know the derivative of the weighted sum to the output activation. In other words, we need the derivative of the activation function.

$$
\frac{\partial a_i}{\partial z_i} = \begin{cases} 1 & \text{if } a_i > 0 \\ 0 & \text{if } a_i \leq 0 \end{cases}
$$
> *ReLU*

$$
\frac{\partial a_i}{\partial z_i} = \sigma(z)(1 - \sigma(z))
$$
> *Sigmoid*

For the softmax function, the derivative is a Jacobian matrix, which describes how every possible input will affect every possible output. Since the softmax function sums up all of the elements and uses it in the calculation, a tiny nudge in one of the inputs will have a drastic effect on **all other outputs.** We need the Jacobian to describe how **each output will be affected by each input.**

$$
\frac{\partial a_i}{\partial z_j} = 
\begin{bmatrix}
\frac{\partial a_1}{\partial z_1} & \dots & \frac{\partial a_1}{\partial z_j} \\
\vdots & \ddots & \vdots \\
\frac{\partial a_i}{\partial z_1} & \dots & \frac{\partial a_i}{\partial z_j}
\end{bmatrix}
$$

$$
\begin{aligned}
\frac{\partial a_i}{\partial z_j} &= a_i \cdot (1 - a_i) \quad \text{when} \quad i = j \\[6pt]
\frac{\partial a_i}{\partial z_j} &= -a_j \cdot a_i \quad \text{when} \quad i \neq j
\end{aligned}
$$

> *The partial derivative of softmax depends on whether or not the output and input are the same index.*

Next, for each layer, we’ll need the derivative of their weights with respect to their activation, as well as the derivative of their biases with respect to activation.

$$
\frac{\partial a}{\partial w} = \frac{\partial a}{\partial z} \cdot \frac{\partial z}{\partial w_j}
$$

$$
\frac{\partial a}{\partial b} = \frac{\partial a}{\partial z} \cdot \frac{\partial z}{\partial b}
$$

The actual derivatives are really simple. Remember that the formula for a weighted sum is

$$
z_i = \sum_{j=1}^{n} w_{ij} a_{prev_i} + b_i
$$

The partial derivatives of the weighted sum with respect to the weights is just the previous activation. The partial derivatives of the weighted sum with respect to the biases is just 1.

As the name suggests, backpropagation will propagate the gradients through the layers of the network backwards. To do this, we’ll need the partial derivative of the weighted sum to the _previous_ layer’s activations, and then we can continue the chain rule for that layer’s weights and biases.

$$
\frac{\partial a}{\partial a_{prev}} = \frac{\partial a}{\partial z} \cdot \frac{\partial z}{\partial a_{prev}}
$$

It turns out the derivative is really simple; it is just the sums of all the weights connecting to that activation.

**Code**
--------

Knowing all the math is one thing; let’s actually go through how to code the network.

Starting off with the most basic unit, the fully-connected Dense layer. This class represents a layer in our multi-layer perceptron

```python
# dense.py
import numpy as np
class Dense():
    def __init__(self, shape, activation=None):
        self.shape = shape
        self.biases = np.zeros((shape[1], 1))
        self.weights = np.random.randn(shape[1], shape[0]) / np.sqrt(shape[0] / 2)
        self.weighted_sums = []
        self.inputs = []
        self.bias_sensitivity = []
        self.weight_sensitivity = []
        if activation == "relu":
            self.activation = self.relu
            self.d_activation = self.d_relu
        elif activation == "sigmoid":
            self.activation = self.sigmoid
            self.d_activation = self.d_sigmoid
        elif activation == "softmax":
            self.activation = self.softmax
            self.d_activation = self.d_softmax
    def activation(self, inp):
        return inp
    def d_activation(self, inp):
        return inp
    def feedforward(self, inputs):
        self.inputs = inputs
        self.weighted_sums = np.matmul(self.weights[np.newaxis, ...], inputs) + self.biases[np.newaxis, ...]
        return self.activation(self.weighted_sums)
    def backprop(self, activation_sensitivity):
        # partial derivatives magic
        # calc how sensitive the bias is (calculate the sigmoid deriv and multiply by how sensitive the output activations are)
        if self.activation == self.softmax:
            # tranposes along the second and third axis
            self.bias_sensitivity = np.matmul(self.d_activation(self.weighted_sums), activation_sensitivity)
        else:
            self.bias_sensitivity = activation_sensitivity * self.d_activation(self.weighted_sums)
        
        # calc how sensitive weights are, input is transposed for matrix multiplication purposes
        self.weight_sensitivity = np.matmul(self.bias_sensitivity, self.inputs.transpose([0, 2, 1]))
        # return the sensitivity of previous activation, will be used in next layer
        return np.matmul(self.weights.transpose()[np.newaxis, ...], self.bias_sensitivity)
    def relu(self, inp):
        return inp * (inp > 0)
    def d_relu(self, inp):
        return 1. * (inp > 0)
    def sigmoid(self, z):
        return 1.0 / (1.0 + np.exp(-z))
    def d_sigmoid(self, z):
        return self.sigmoid(z) * (1 - self.sigmoid(z))
    def softmax(self, x):
        e_x = np.exp(x - np.max(x, axis=1, keepdims=True))
        return e_x / e_x.sum(axis=1, keepdims=True)
    
    # this implementation already transposes it
    def d_softmax(self, x):
        # jacobian matrix magic
        sm = self.softmax(x).squeeze()  # shape: (n, 10)
        # Expand sm to create a (n, 10, 1) and (n, 1, 10) for broadcasting
        sm_col = sm[:, :, np.newaxis]  # (n, 10, 1)
        sm_row = sm[:, np.newaxis, :]  # (n, 1, 10)
        # Compute Jacobian matrix for each example using broadcasting
        # np.identity forms diagonals (kronecker delta function i=j case)
        jacobian = sm_row * np.identity(10) - sm_col * sm_row  # (n, 10, 10)
        return jacobian
```

The layer is initialized with all of the biases at 0, and the weights using the **Xavier/Glorot initialization**, with a mean of 0 and a standard deviation proportional to the square root of the number of input neurons. An activation function can be specified to configure the network’s behavior. We keep track of the weighted_sums and inputs for our backpropagation algorithm, and the gradients are stored in weight_sensitivity and bias_sensitivity.

The feedforward implementation is fairly straightforward, it is just the matrix multiplication we mentioned earlier. The backpropagation is what I want to focus on.

Each layer’s backpropagation looks like this:

1.  Calculate the bias_sensitivity by multiplying the derivative of the activation function with the activation. For the softmax, since it is a Jacobian matrix, we perform matrix multiplication. This gets us the sums of every input’s sensitivity to output, and the shapes work out. For all other activation functions, we do the **Hadamard product,** which is the element-wise product.
2.  Calculate the weight_sensitivity by multiplying the bias_sensitivity with the previous layer’s activations (the current layer’s inputs). The inputs are transposed because we want it to fit the shape of the weights (every input is connected to every output).
3.  Calculate the new activation_sensitivity by multiplying the weights with the bias_sensitivity. This represents the sensitivity to the previous activation, which will be used for the next layer’s backpropagation.

Then, onto the network:

```python
# network.py
import numpy as np
import json
import time
class Network:
    def __init__(self, cost="crossentropy"):
        self.layers = []
        self.size = []
        if cost == "MSE":
            self.cost = self.MSE
            self.d_cost = self.d_MSE
        if cost == "crossentropy":
            self.cost = self.xentropy
            self.d_cost = self.d_xentropy
    def cost(self, output, expected):
        return output
    def d_cost(self, output, expected):
        return output
    
    def add_layers(self, *layers):
        for l in layers:
            self.layers.append(l)
            if len(self.size) != 0:
                self.size.pop()
            self.size.append(l.shape[0])
            self.size.append(l.shape[1])
    def feedforward(self, input):
        # feeds the output of one layer as the input to the next
        for l in self.layers:
            input = l.feedforward(input)
        return input
    def backprop(self, output, expected):
        # calculate how sensitive the output activation is to the cost func
        activation_sensitivity = self.d_cost(output, expected)
        # loop through model, running backprop to get the gradients
        for i in range(len(self.layers) - 1, -1, -1):
            activation_sensitivity = self.layers[i].backprop(activation_sensitivity)
    def sgd(self, training_data, learn_rate, lmbda, epochs=1, validation_data=None):
        tr_x, tr_y = training_data
        previous_cost = None
        # calculate the total amount of samples
        train_data_size = 0
        for t in training_data[0]:
          train_data_size += len(t)
        val_data_size = 0
        for v in validation_data[0]:
          val_data_size += len(v)
        # for each epoch
        for i in range(epochs):
            start = time.time()
            training_correct = 0
            training_total = 0
            training_cost = 0
            for batch_num in range(len(tr_x)):
                # feed data through model to calc weights, biases, activations, etc
                batch_size = tr_x[batch_num].shape[0]
                output = self.feedforward(tr_x[batch_num])
                # perform backpropagation and update parameters 
                self.backprop(output, tr_y[batch_num])
                self.update_parameters(learn_rate, lmbda, batch_size, train_data_size)
                # update the statistics and print them
                training_correct += np.sum(np.argmax(output, axis=1) == np.argmax(tr_y[batch_num], axis=1))
                training_total += batch_size
                training_cost += np.sum(self.cost(output, tr_y[batch_num]))
                print(f"\rEpoch {i + 1}/{epochs}: ({batch_num + 1}/{len(tr_x)}) | Accuracy: {training_correct}/{training_total} | Cost: {training_cost / training_total}", end="")
            # once training a batch is done, print out statistics
            elapsed = (time.time() - start) * 1000
            print(f"\rEpoch {i + 1} Complete, Time: {round(elapsed)}ms ({round(elapsed / len(tr_x))}ms/batch), Test Accuracy: {training_correct} / {training_total}, Average Test Cost: {training_cost / training_total}", end="")
            
            # if there is validation data, add those to the statistics
            if validation_data:
                correct, total_cost = self.evaluate(validation_data)
                avg_cost = total_cost / val_data_size
                print(f", Validation Accuracy: {correct} / {val_data_size}, Validation Average Cost = {np.round(avg_cost, 5)} {'({0:+})'.format(np.round(avg_cost - previous_cost, 5)) if previous_cost is not None else ''}", end="")
                previous_cost = avg_cost
            print()
    def update_parameters(self, learn_rate, lmbda, batch_size, total_size):
        # update weight and biases based on gradients
        for l in self.layers:
            total_bias_sens = np.sum(l.bias_sensitivity, axis=0)
            total_weight_sens = np.sum(l.weight_sensitivity, axis=0)
            l.biases -= learn_rate * (total_bias_sens / batch_size)
            l.weights -= learn_rate * (total_weight_sens / batch_size) + learn_rate * (lmbda / total_size) * l.weights
    def evaluate(self, validation_data):
        val_x, val_y = validation_data
        total_cost = 0
        total_correct = 0
        for i in range(len(validation_data[0])):
          out = self.feedforward(val_x[i])
          total_cost += np.sum(self.cost(out, val_y[i]))
          total_correct += np.sum(np.argmax(out, axis=1) == np.argmax(val_y[i], axis=1))
        return total_correct, total_cost
    
    def MSE(self, output, expected):
        return np.square(output - expected)
    def d_MSE(self, output, expected):
        return 2 * (output - expected)
    
    def xentropy(self, output, expected):
        return -expected * np.log(output)
    def d_xentropy(self, output, expected):
        return -expected/output
    def load_model(self, filename):
        f = open(filename, "r")
        data = json.load(f)
        f.close()
        if (self.size != data["sizes"]):
            raise TypeError(f"Data does not match network size of {self.size}")
        for i in range(len(data["weights"])):
            w = np.array(data["weights"][i])
            self.layers[i].weights = w
        for i in range(len(data["biases"])):
            w = np.array(data["biases"][i])
            self.layers[i].biases = w
    def export_model(self, filename):
        data = {
            "sizes": self.size,
            "weights": [l.weights.tolist() for l in self.layers],
            "biases": [l.biases.tolist() for l in self.layers]
        }
        f = open(filename, "w")
        json.dump(data, f)
        f.close()
```

The network is initialized with a certain cost function (cross-entropy by default). To configure the network, the add_layers function is introduced to append layers, allowing for users to control how deep or big the model is.

The feedforward implementation iteratively calls each layer, feeding the output of one layer as the input to the next layer. It returns the activations of the output layer.

The backpropagation calculates the partial derivative of the cost to the outputs (referred to as activation_sensitivity”). It loops through each layer **backwards**, calling backprop() to each one and feeding the activation_sensitivity returned from the function to the next layer.

The SGD (**stochastic gradient descent**) method loops through a certain amont of epochs, calling feedforward, then backpropogation and then updating all the weights. It then updates all the weights and biases based on the averaged gradients (“sensitivity”), multiplied by the learn rate. It trains the data based on the **train dataset,** but evaluates the model’s accuracy on the **validation dataset.** For MNIST, the train is around 50,000 samples and the validation is around 10,000. It can print out metrics such as % accuracy and cost.

### Vectorization

You’ll notice that in the code, a lot of the matrixes have different shapes than what I described. The math is a lot easier to visualize with vectors and 2d matrixes, but the code can be optimized through a process known as **vectorization.**

During our feedforward and backpropagation steps, we are repeating a lot of the same steps. We multiply all the training samples by the same model weights and biases, and we compute all of the gradients using those same values. Instead of iterating through each element one by one, we can apply the operation to the entire data all at once. How this works in numpy is by using array broadcasting, and letting numpy’s highly efficient matrix manipulation code to run them in parallel.

The training samples are divided into batches of size _n._ A matrix of _n_ training samples is passed into the feedforward of the model. By reshaping the weight matrix and bias matrix, we can tell numpy that we want to broadcast the array and apply the matrix operation to the entire batch.

![An example of how array broadcasting can apply the same operation (in this case, doubling), to multiple samples at once. Numpy will run this in parallel, resulting in massive efficiency and speed gains.](https://miro.medium.com/v2/resize:fit:1040/format:webp/1*D4pPxzcG_qAx2hVYa_HT8w.png)

Vectorizing the code made the code run _much_ faster, around 500–1000x speed improvements when ran using CuPy on a Tesla T4 GPU. This is mainly because GPUs are really efficient at highly parallelized arithmetic tasks, making them very suitable for machine learning applications. If you want to give it a try, I highly recommend using Google Colab as it gives you free access to GPUs for testing.

Here’s the link to my code on Colab if you want to try running it on some GPUs (this is also how I trained it): [https://colab.research.google.com/drive/1VYo-ZNZ4uwrWmdwDi1H6d15KAioEA7J9?usp=sharing](https://colab.research.google.com/drive/1VYo-ZNZ4uwrWmdwDi1H6d15KAioEA7J9?usp=sharing).

The code uses CuPy, which is pretty much a drop-in replacement for Numpy that runs on the GPU.

Conclusion
----------

Neural networks are fascinating, and I highly encourage people to get a deep understanding of the incredible mathematics that goes behind them. In the future, I’d love to expand on this project, adding convolutional layers and hopefully improving the accuracy. I also would love to expand the datasets and train it on harder tasks such as MNIST fashion or Google Draw. I hope this article inspires you to dive deeper into the world of neural networks and build something amazing!

Sources
-------

These are some great explanations for neural networks that I’ve used, and recommend checking out:

*   [3Blue1Brown’s Playlist on Neural Networks](https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi) — amazing visual explanations of neural networks; a fantastic resource for getting started.
*   [Michael Nielsen’s Neural Networks and Deep Learning](http://neuralnetworksanddeeplearning.com/)— dives heavily into the math, and shares the python code (I’d recommend optimizing/vectorizing the code yourself — the code is fairly intuitive and written with for loops for simplicity, but doesn’t take full advantage of linear algebra libraries)